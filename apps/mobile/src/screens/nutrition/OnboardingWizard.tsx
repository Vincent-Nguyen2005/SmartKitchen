import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { DateField, toDisplayDate } from "../admin/DateField";
import { GenderTiles } from "./GenderTiles";
import { HealthPreferencesSection, type HealthSectionHandle, type HealthTab } from "./NutritionProfileScreen";
import { createNutritionProfileApi, Gender, NutritionApiError } from "./nutritionProfileApi";
import {
  ageFrom,
  basicsError,
  birthDateError,
  birthCalendarStart,
  birthDateForAge,
  DEFAULT_ACTIVITY,
  heightRangeError,
  heightReading,
  heightToCm,
  heightValid,
  MIN_BIRTH_DATE,
  normalizeDecimal,
  todayIso,
  weightRangeError,
  weightValid,
} from "./profileFields";

type Step = "gender" | "birthDate" | "height" | "weight" | HealthTab | "summary";
const STEPS: readonly Step[] = ["gender", "birthDate", "height", "weight", "allergies", "conditions", "summary"];
/** Steps counted in "Bước n/6" (all but the summary). */
const COUNTED_STEPS = STEPS.length - 1;
const isHealthStep = (step: Step): step is HealthTab => step === "allergies" || step === "conditions";
const GENDER_LABEL: Record<Gender, string> = { MALE: "Nam", FEMALE: "Nữ" };

type Props = {
  /** Ends the step: saved, "Để sau", or the user already has a profile (or it could not be checked). */
  onDone: () => void;
};

/**
 * "Thông tin cơ bản" after sign-in: one question per screen (giới tính, ngày sinh, chiều cao, cân nặng), then the
 * optional allergies and health conditions (one step each), then a summary whose rows jump back to edit. "Hoàn tất" saves through the
 * nutrition profile API; "Để sau" leaves without saving. Answers are kept while moving back and forth.
 */
export default function OnboardingWizard({ onDone }: Props): React.JSX.Element {
  const accessToken = useSession().accessToken ?? undefined;
  const api = useMemo(() => (accessToken ? createNutritionProfileApi(accessToken) : undefined), [accessToken]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>("gender");
  /** Set when a summary row was tapped: "Tiếp" goes back to the summary. */
  const [editing, setEditing] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [healthVisited, setHealthVisited] = useState(false);
  /** Per list: true after "Bỏ qua" (its additions were dropped), false after "Tiếp". */
  const [skipped, setSkipped] = useState<Record<HealthTab, boolean | null>>({ allergies: null, conditions: null });
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const healthRef = useRef<HealthSectionHandle>(null);

  // Users who already have a profile never see the wizard; an error must not block the app either.
  useEffect(() => {
    let active = true;
    if (!api) {
      onDoneRef.current();
      return undefined;
    }
    api.get()
      .then(() => { if (active) onDoneRef.current(); })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof NutritionApiError && requestError.status === 404) setChecking(false);
        else onDoneRef.current();
      });
    return () => { active = false; };
  }, [api]);

  const index = STEPS.indexOf(step);
  const goTo = (next: Step) => {
    setError("");
    if (isHealthStep(next)) setHealthVisited(true);
    setStep(next);
  };
  const next = () => {
    if (editing || index + 1 >= STEPS.length) {
      setEditing(false);
      goTo("summary");
    } else {
      goTo(STEPS[index + 1]);
    }
  };
  const back = () => {
    setEditing(false);
    if (index > 0) goTo(STEPS[index - 1]);
  };
  const edit = (target: Step) => {
    setEditing(true);
    goTo(target);
  };

  const finish = async () => {
    if (!api || saving) return;
    const message = !gender ? "Chọn giới tính." : basicsError(height, weight, birthDate);
    if (message || !gender) {
      setError(message ?? "");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const profile = { height: heightToCm(height), weight: Number(weight), birthDate, gender, activityLevel: DEFAULT_ACTIVITY };
      // A retry after a failed tag save updates the profile created a moment ago.
      if (created) await api.update(profile);
      else await api.create(profile);
      setCreated(true);
    } catch (saveError: unknown) {
      const detail = saveError instanceof Error && saveError.message ? saveError.message : "Đã xảy ra lỗi không xác định.";
      setError(`Không thể lưu hồ sơ. ${detail}`);
      setSaving(false);
      return;
    }
    // Skipped lists were already put back by reset(), so saving keeps nothing new from them.
    const healthError = healthVisited ? (await healthRef.current?.save()) ?? null : null;
    setSaving(false);
    if (healthError) {
      setError(healthError);
      return;
    }
    onDoneRef.current();
  };

  if (checking) {
    return (
      <SafeAreaView style={local.safeArea}>
        <ActivityIndicator color={colors.primary} style={local.loader} />
      </SafeAreaView>
    );
  }

  const age = ageFrom(birthDate);
  const birthProblem = birthDate ? birthDateError(birthDate) : null;
  const tagSummary = (kind: HealthTab, names: string[]) => (skipped[kind] !== false ? "Bỏ qua" : names.length ? names.join(", ") : "Không có");

  let title = "";
  let hint = "";
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  const primary = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled, busy: saving }}
      disabled={!enabled || saving}
      onPress={onPress}
      style={({ pressed }) => [local.primaryButton, local.grow, pressed && local.pressed, (!enabled || saving) && local.disabled]}
    >
      {saving ? <ActivityIndicator color={colors.primaryText} /> : <Text style={local.primaryText}>{label}</Text>}
    </Pressable>
  );

  switch (step) {
    case "gender":
      title = "Giới tính của bạn?";
      hint = "Dùng để ước tính nhu cầu dinh dưỡng hằng ngày.";
      body = (
        <View style={local.answer}>
          <GenderTiles value={gender} onChange={(value) => { setGender(value); next(); }} />
        </View>
      );
      break;
    case "birthDate":
      title = "Ngày sinh của bạn?";
      body = (
        <View style={local.answer}>
          <DateField
            label="Ngày sinh"
            value={birthDate}
            onChange={setBirthDate}
            minDate={MIN_BIRTH_DATE}
            maxDate={todayIso()}
            suggestedDate={birthCalendarStart()}
            hideLabel
            size="large"
          />
          {!!birthProblem && <Text style={local.fieldError}>{birthProblem}</Text>}
        </View>
      );
      footer = primary("Tiếp", !!birthDate && !birthProblem, next);
      break;
    case "height":
    case "weight": {
      const isHeight = step === "height";
      const value = isHeight ? height : weight;
      const valid = isHeight ? heightValid(value) : weightValid(value);
      const problem = isHeight ? heightRangeError(value) : weightRangeError(value);
      title = isHeight ? "Chiều cao của bạn?" : "Cân nặng của bạn?";
      body = (
        <View style={local.answer}>
          <View style={local.inputShell}>
            <TextInput
              key={step}
              autoFocus
              accessibilityLabel={isHeight ? "Chiều cao (m)" : "Cân nặng (kg)"}
              keyboardType="decimal-pad"
              returnKeyType="next"
              value={value}
              onChangeText={(text) => (isHeight ? setHeight : setWeight)(normalizeDecimal(text))}
              onSubmitEditing={() => { if (valid) next(); }}
              placeholder={isHeight ? "1.70" : "0"}
              placeholderTextColor={colors.muted}
              style={local.input}
            />
            <Text style={local.unit}>{isHeight ? "m" : "kg"}</Text>
          </View>
          {!!problem && <Text style={local.fieldError}>{problem}</Text>}
        </View>
      );
      footer = primary("Tiếp", valid, next);
      break;
    }
    case "allergies":
    case "conditions": {
      const kind = step;
      title = kind === "allergies" ? "Bạn có dị ứng gì không?" : "Tình trạng sức khỏe của bạn?";
      footer = (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => { healthRef.current?.reset(kind); setSkipped((current) => ({ ...current, [kind]: true })); next(); }}
            style={({ pressed }) => [local.secondaryButton, local.grow, pressed && local.pressed]}
          >
            <Text style={local.secondaryText}>Bỏ qua</Text>
          </Pressable>
          {primary("Tiếp", true, () => { setSkipped((current) => ({ ...current, [kind]: false })); next(); })}
        </>
      );
      break;
    }
    case "summary":
      title = "Kiểm tra lại thông tin";
      hint = "Chạm vào một dòng để sửa.";
      body = (
        <View style={local.summary}>
          <SummaryRow label="Giới tính" value={gender ? GENDER_LABEL[gender] : "Chưa chọn"} onPress={() => edit("gender")} />
          <SummaryRow label="Ngày sinh" value={birthDate ? `${toDisplayDate(birthDate)}${age !== null ? ` (${age} tuổi)` : ""}` : "Chưa chọn"} onPress={() => edit("birthDate")} />
          <SummaryRow label="Chiều cao" value={heightReading(height) ?? (height ? `${height} m` : "Chưa nhập")} onPress={() => edit("height")} />
          <SummaryRow label="Cân nặng" value={weight ? `${weight} kg` : "Chưa nhập"} onPress={() => edit("weight")} />
          <SummaryRow label="Dị ứng" value={tagSummary("allergies", allergies)} onPress={() => edit("allergies")} />
          <SummaryRow label="Tình trạng sức khỏe" value={tagSummary("conditions", conditions)} onPress={() => edit("conditions")} last />
        </View>
      );
      footer = primary("Hoàn tất", true, () => void finish());
      break;
  }

  const counted = index < COUNTED_STEPS;
  const progress = counted ? (index + 1) / COUNTED_STEPS : 1;
  return (
    <SafeAreaView style={local.safeArea}>
      <KeyboardAvoidingView style={local.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={local.header}>
          {index > 0 ? (
            <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại" color={colors.text} onPress={back} />
          ) : (
            <View style={local.headerSpacer} />
          )}
          <Text style={local.headerTitle}>Thông tin cơ bản</Text>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => onDoneRef.current()} style={({ pressed }) => [local.laterButton, pressed && local.pressed]}>
            <Text style={local.laterText}>Để sau</Text>
          </Pressable>
        </View>
        <View style={local.progress}>
          <View style={local.progressTrack}>
            <View style={[local.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={local.progressText}>{counted ? `Bước ${index + 1}/${COUNTED_STEPS}` : "Xem lại"}</Text>
        </View>

        <ScrollView
          style={local.flex}
          contentContainerStyle={local.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Text accessibilityRole="header" style={local.title}>{title}</Text>
          {!!hint && <Text style={local.hint}>{hint}</Text>}
          {body}
          {/* Mounted from the first visit and only hidden afterwards, so the tags survive moving between steps. */}
          {accessToken && healthVisited ? (
            <View style={isHealthStep(step) ? undefined : local.hidden}>
              <HealthPreferencesSection
                ref={healthRef}
                compact
                accessToken={accessToken}
                only={step === "conditions" ? "conditions" : "allergies"}
                onTagsChange={(allergyNames, conditionNames) => { setAllergies(allergyNames); setConditions(conditionNames); }}
              />
            </View>
          ) : null}
          {!!error && <Text accessibilityRole="alert" style={local.fieldError}>{error}</Text>}
        </ScrollView>

        {footer && <View style={local.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value, onPress, last }: { label: string; value: string; onPress: () => void; last?: boolean }): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Sửa`}
      onPress={onPress}
      style={({ pressed }) => [local.summaryRow, !last && local.summaryDivider, pressed && local.pressed]}
    >
      <View style={local.flex}>
        <Text style={local.summaryLabel}>{label}</Text>
        <Text style={local.summaryValue}>{value}</Text>
      </View>
      <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
    </Pressable>
  );
}

const local = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  loader: { marginTop: spacing.xl },
  header: { alignItems: "center", flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  headerSpacer: { height: touchTarget, width: touchTarget },
  headerTitle: { ...textStyles.labelSmall, color: colors.muted, flex: 1, textAlign: "center" },
  laterButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.sm },
  laterText: { ...textStyles.labelSmall, color: colors.primary },
  progress: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  progressTrack: { backgroundColor: colors.border, borderRadius: radius.pill, height: 4, overflow: "hidden" },
  progressFill: { backgroundColor: colors.primary, borderRadius: radius.pill, height: 4 },
  progressText: { ...textStyles.caption, color: colors.muted },
  content: { gap: spacing.md, padding: spacing.lg, paddingTop: spacing.xl },
  title: { ...textStyles.pageTitle },
  hint: { ...textStyles.body, color: colors.muted },
  answer: { gap: spacing.sm, marginTop: spacing.sm },
  fieldError: { ...textStyles.bodySmall, color: colors.danger },
  /** Same size as the DateField on the birth-date step; the unit sits inside on the right (as in Hồ sơ). */
  inputShell: {
    alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1,
    flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md,
  },
  input: { ...textStyles.body, color: colors.text, flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  unit: { ...textStyles.caption, color: colors.muted },
  summary: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: touchTarget + spacing.md, paddingVertical: spacing.sm },
  summaryDivider: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  summaryLabel: { ...textStyles.bodySmall, color: colors.muted },
  summaryValue: { ...textStyles.label },
  hidden: { display: "none" },
  footer: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  grow: { flex: 1 },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: "center", minHeight: touchTarget + spacing.md },
  primaryText: { ...textStyles.label, color: colors.primaryText },
  secondaryButton: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.md, borderWidth: 1, justifyContent: "center", minHeight: touchTarget + spacing.md },
  secondaryText: { ...textStyles.label, color: colors.primary },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
});
