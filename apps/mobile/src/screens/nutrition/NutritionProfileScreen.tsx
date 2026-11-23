import { useSession } from "../../services/session";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  TextInput,
  View,
} from "react-native";
import { DateField } from "../admin/DateField";
import { TagInput } from "../../components/TagInput";
import { SegmentTabs } from "../../components/SegmentTabs";
import { useConfirm } from "../../components/ConfirmDialog";
import { GenderTiles } from "./GenderTiles";
import {
  ActivityLevel,
  createHealthPreferencesApi,
  createNutritionProfileApi,
  Gender,
  HealthOption,
  NutritionApiError,
  NutritionProfileInput,
  NutritionProfileResult,
} from "./nutritionProfileApi";

import {
  ageFrom,
  basicsError,
  birthCalendarStart,
  birthDateForAge,
  DEFAULT_ACTIVITY,
  cmToHeightText,
  heightRangeError,
  heightReading,
  heightToCm,
  MIN_BIRTH_DATE,
  normalizeDecimal,
  todayIso,
  weightRangeError,
} from "./profileFields";

/** "closed": nothing to save; "saved": saved, the caller shows the toast; "stay": keep the screen open. */
export type LeaveResult = "closed" | "saved" | "stay";
export type NutritionProfileHandle = { leave: () => Promise<LeaveResult> };
type Basics = { height: string; weight: string; birthDate: string; gender: Gender };

/**
 * Hồ sơ › Thông tin sức khỏe. No save button: the screen saves when it is left (App calls `leave()` on the back
 * arrow, Android back or close). Nothing changed: close. Valid: save (basic info, then the tags) and close.
 * Invalid: "Thông tin chưa hợp lệ. Thoát mà không lưu?" (Ở lại / Thoát). A failed save keeps the screen open.
 */
const NutritionProfileScreen = forwardRef<NutritionProfileHandle>(function NutritionProfileScreen(_props, ref): React.JSX.Element {
  const accessToken = useSession().accessToken ?? undefined;
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 400;
  const api = useMemo(
    () =>
      accessToken
        ? createNutritionProfileApi(accessToken)
        : undefined,
    [accessToken],
  );
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("FEMALE");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [submitted, setSubmitted] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [result, setResult] = useState<NutritionProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRef = useRef<HealthSectionHandle>(null);
  /** The basic info as loaded (or the empty form): what "changed" is compared with. */
  const loaded = useRef<Basics>({ height: "", weight: "", birthDate: "", gender: "FEMALE" });
  const leaving = useRef(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    let active = true;
    if (!api) {
      setLoading(false);
      setError("Vui lòng đăng nhập để tải hồ sơ dinh dưỡng.");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    api
      .get()
      .then((data) => {
        if (!active) return;
        loaded.current = {
          height: cmToHeightText(data.profile.height),
          weight: normalizeDecimal(String(data.profile.weight)),
          birthDate: data.profile.birthDate ?? (typeof data.profile.age === "number" ? birthDateForAge(data.profile.age) : ""),
          gender: data.profile.gender,
        };
        setHeight(loaded.current.height);
        setWeight(loaded.current.weight);
        setBirthDate(loaded.current.birthDate);
        setGender(loaded.current.gender);
        setActivityLevel(data.profile.activityLevel);
        setResult(data);
        setHasProfile(true);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (
          requestError instanceof NutritionApiError &&
          requestError.status === 404
        ) {
          setError("");
        } else {
          setError("Không thể tải hồ sơ dinh dưỡng. Vui lòng thử lại.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, accessToken]);

  const heightError = heightRangeError(height);
  const weightError = weightRangeError(weight);
  const age = ageFrom(birthDate);

  const basicsChanged = (): boolean => {
    const before = loaded.current;
    return height !== before.height || weight !== before.weight || birthDate !== before.birthDate || gender !== before.gender;
  };

  /** Leaving the screen: close, save then close, or ask (invalid) / stay (save failed). */
  const leave = async (): Promise<LeaveResult> => {
    if (leaving.current) return "stay";
    if (loading || !api) return "closed";
    const changedBasics = basicsChanged();
    const changedTags = healthRef.current?.isDirty() ?? false;
    if (!changedBasics && !changedTags) return "closed";
    // The basic info is only validated (and saved) when it was changed: tags alone can be saved without it.
    const message = changedBasics ? basicsError(height, weight, birthDate) : null;
    if (message) {
      setSubmitted(true);
      setError(message);
      const exit = await confirm({ title: "Thông tin chưa hợp lệ. Thoát mà không lưu?", message, confirmLabel: "Thoát", cancelLabel: "Ở lại" });
      return exit ? "closed" : "stay";
    }
    leaving.current = true;
    try {
      return (await save(changedBasics, changedTags)) ? "saved" : "stay";
    } finally {
      leaving.current = false;
    }
  };
  useImperativeHandle(ref, () => ({ leave }));

  /** Saves the changed parts: the basic info first, then the allergy / health tags. False (with the error shown) on failure. */
  const save = async (saveBasics: boolean, saveTags: boolean): Promise<boolean> => {
    if (!api) return false;
    setSaving(true);
    setError("");
    if (saveBasics) {
      const ok = await saveProfile();
      if (!ok) { setSaving(false); return false; }
    }
    const healthError = saveTags ? (await healthRef.current?.save()) ?? null : null;
    setSaving(false);
    if (healthError) {
      setError(healthError);
      showToast(healthError);
      return false;
    }
    return true;
  };

  const saveProfile = async (): Promise<boolean> => {
    if (!api) return false;
    // Entered in meters; the API keeps centimeters.
    const parsedHeight = heightToCm(height);
    const parsedWeight = Number(weight);
    const profile: NutritionProfileInput = {
      height: parsedHeight,
      weight: parsedWeight,
      // nutrition-service stores the date and computes the age from it (Vietnam time).
      birthDate,
      gender,
      activityLevel,
    };
    try {
      const data = hasProfile ? await api.update(profile) : await api.create(profile);
      setResult(data);
      setHasProfile(true);
      loaded.current = { height, weight, birthDate, gender };
      return true;
    } catch (saveError: unknown) {
      const message = saveError instanceof Error && saveError.message ? saveError.message : "Đã xảy ra lỗi không xác định.";
      console.error("Failed to save nutrition profile.", {
        status: saveError instanceof NutritionApiError ? saveError.status : undefined,
        message,
      });
      setError(`Không thể lưu hồ sơ. ${message}`);
      showToast(`Không thể lưu hồ sơ. ${message}`);
      return false;
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <View style={[styles.formCard, isCompact && styles.cardCompact]}>
                <Text style={styles.cardTitle}>Thông tin cơ bản</Text>
                <Text style={styles.cardHint}>
                  Các chỉ số giúp ước tính nhu cầu dinh dưỡng hằng ngày.
                </Text>
                <View style={[styles.measurements, isCompact && styles.measurementsCompact]}>
                  <NumberField
                    label="Chiều cao"
                    unit="m"
                    placeholder="1.70"
                    hint={heightReading(height)}
                    value={height}
                    onChangeText={(value) => setHeight(normalizeDecimal(value))}
                    error={heightError ?? (submitted && !height.trim() ? "Nhập chiều cao." : null)}
                  />
                  <NumberField
                    label="Cân nặng"
                    unit="kg"
                    value={weight}
                    onChangeText={(value) => setWeight(normalizeDecimal(value))}
                    error={weightError ?? (submitted && !weight.trim() ? "Nhập cân nặng." : null)}
                  />
                </View>
                <View style={styles.birthRow}>
                  <View style={styles.birthField}>
                    <DateField
                      label="Ngày sinh"
                      value={birthDate}
                      onChange={setBirthDate}
                      minDate={MIN_BIRTH_DATE}
                      maxDate={todayIso()}
                      suggestedDate={birthCalendarStart()}
                    />
                  </View>
                  {age !== null && age >= 0 && <Text style={styles.ageText}>{age} tuổi</Text>}
                </View>

                <Text style={styles.sectionTitle}>Giới tính</Text>
                <GenderTiles value={gender} onChange={setGender} />
              </View>

              {accessToken ? <HealthPreferencesSection ref={healthRef} compact={isCompact} accessToken={accessToken} /> : null}

              {!!error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
              {saving && <ActivityIndicator color={colors.primary} accessibilityLabel="Đang lưu" />}

              {result && (
                <View accessibilityLiveRegion="polite" style={[styles.result, isCompact && styles.cardCompact]}>
                  <Text style={styles.resultLabel}>MỤC TIÊU NĂNG LƯỢNG</Text>
                  <Text style={styles.calorie}>
                    {result.tdee.toLocaleString("vi-VN")}{" "}
                    <Text style={styles.kcal}>kcal / ngày</Text>
                  </Text>
                  <Text style={styles.resultNote}>
                    Ước tính theo hồ sơ · BMR {result.bmr.toLocaleString("vi-VN")} kcal
                  </Text>
                </View>
              )}
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
      {toast && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.toast}>{toast}</Text>
        </View>
      )}
      {dialog}
    </SafeAreaView>
  );
});
export default NutritionProfileScreen;

/** Saves the tags; resolves to null on success or the error message. */
export type HealthTab = "allergies" | "conditions";
export type HealthSectionHandle = {
  save: () => Promise<string | null>;
  /** Puts one list back to the tags loaded (or last saved), dropping what was added since ("Bỏ qua"). */
  reset: (kind: HealthTab) => void;
  /** True when the tags differ from the loaded (or last saved) ones. */
  isDirty: () => boolean;
};
const HEALTH_TABS: ReadonlyArray<{ value: HealthTab; label: string }> = [
  { value: "allergies", label: "Dị ứng" },
  { value: "conditions", label: "Tình trạng sức khỏe" },
];

/**
 * Allergies and health conditions as tag inputs, one tab at a time (switching keeps unsaved tags). Saved by the
 * screen's single "Lưu" through the ref.
 */
type HealthSectionProps = {
  compact: boolean;
  accessToken: string;
  /** Called with the tag names whenever they change (the onboarding summary lists them). */
  onTagsChange?: (allergies: string[], conditions: string[]) => void;
  /** Show only this list, without the tabs (onboarding has one step per list). */
  only?: HealthTab;
};

export const HealthPreferencesSection = forwardRef<HealthSectionHandle, HealthSectionProps>(function HealthPreferencesSection({
  compact,
  accessToken,
  onTagsChange,
  only,
}, ref): React.JSX.Element {
  const api = createHealthPreferencesApi(accessToken);
  const [allergies, setAllergies] = useState<HealthOption[]>([]);
  const [conditions, setConditions] = useState<HealthOption[]>([]);
  /** Tag names shown: catalog items and the user's own (custom) items. */
  const [allergyTags, setAllergyTags] = useState<string[]>([]);
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tabChoice, setTab] = useState<HealthTab>("allergies");
  const tab = only ?? tabChoice;
  /** Tags as loaded or last saved, for reset(). */
  const baseline = useRef<Record<HealthTab, string[]>>({ allergies: [], conditions: [] });
  const onTagsChangeRef = useRef(onTagsChange);
  onTagsChangeRef.current = onTagsChange;
  useEffect(() => { onTagsChangeRef.current?.(allergyTags, conditionTags); }, [allergyTags, conditionTags]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getAllergies(), api.getConditions(), api.getSelection()])
      .then(([allergyOptions, conditionOptions, selection]) => {
        if (!active) return;
        setAllergies(allergyOptions);
        setConditions(conditionOptions);
        baseline.current = {
          allergies: tagsOf(selection.allergies, selection.customAllergies),
          conditions: tagsOf(selection.healthConditions, selection.customConditions),
        };
        setAllergyTags(baseline.current.allergies);
        setConditionTags(baseline.current.conditions);
      })
      .catch(() => {
        if (active) setMessage("Không thể tải dị ứng và tình trạng sức khỏe đã khai báo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const tagsOf = (selected: HealthOption[], custom: string[] = []) => [...selected.map(({ name }) => name), ...custom];
  /** Catalog names become ids; anything else is saved as the user's own item. */
  const splitTags = (names: string[], options: HealthOption[]) => ({
    ids: names.flatMap((name) => options.find((option) => option.name === name)?.id ?? []),
    custom: names.filter((name) => !options.some((option) => option.name === name)),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (loading) return null;
      try {
        const allergySplit = splitTags(allergyTags, allergies);
        const conditionSplit = splitTags(conditionTags, conditions);
        const selection = await api.saveSelection(allergySplit.ids, conditionSplit.ids, allergySplit.custom, conditionSplit.custom);
        baseline.current = {
          allergies: tagsOf(selection.allergies, selection.customAllergies),
          conditions: tagsOf(selection.healthConditions, selection.customConditions),
        };
        setAllergyTags(baseline.current.allergies);
        setConditionTags(baseline.current.conditions);
        return null;
      } catch {
        return "Không thể lưu dị ứng và tình trạng sức khỏe. Vui lòng thử lại.";
      }
    },
    reset: (kind) => {
      if (kind === "allergies") setAllergyTags(baseline.current.allergies);
      else setConditionTags(baseline.current.conditions);
    },
    isDirty: () => {
      if (loading) return false;
      const same = (left: string[], right: string[]) => left.length === right.length && [...left].sort().join("\n") === [...right].sort().join("\n");
      return !same(allergyTags, baseline.current.allergies) || !same(conditionTags, baseline.current.conditions);
    },
  }), [loading, allergyTags, conditionTags, allergies, conditions]);


  return (
    <View style={[styles.healthSection, compact && styles.cardCompact]}>
      {!only && <SegmentTabs<HealthTab> options={HEALTH_TABS} value={tab} onChange={setTab} />}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.healthLoader} />
      ) : (
        <>
          {tab === "allergies" ? (
            <TagInput
              tags={allergyTags}
              onChange={(names) => { setAllergyTags(names); setMessage(""); }}
              suggestions={allergies.map((option) => option.name)}
              accessibilityLabel="Thêm dị ứng"
              placeholder="Ví dụ: sữa, hải sản"
            />
          ) : (
            <TagInput
              tags={conditionTags}
              onChange={(names) => { setConditionTags(names); setMessage(""); }}
              suggestions={conditions.map((option) => option.name)}
              accessibilityLabel="Thêm tình trạng sức khỏe"
              placeholder="Ví dụ: tiểu đường, gout"
            />
          )}
          {!!message && (
            <Text accessibilityRole="alert" style={styles.healthMessage}>
              {message}
            </Text>
          )}
        </>
      )}
    </View>
  );
});

function NumberField({
  label,
  unit,
  value,
  onChangeText,
  error,
  placeholder = "0.00",
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  placeholder?: string;
  /** Shown under a valid value (height: "1m70"). */
  hint?: string | null;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toastWrap: { alignItems: "center", bottom: spacing.xl, left: spacing.lg, position: "absolute", right: spacing.lg },
  toast: { ...textStyles.labelSmall, backgroundColor: colors.text, borderRadius: 20, color: colors.surface, overflow: "hidden", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, textAlign: "center" },
  birthRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  birthField: { flex: 1 },
  ageText: { ...textStyles.label, color: colors.primary },
  fieldError: { ...textStyles.caption, color: colors.danger, marginTop: spacing.xs },
  fieldHint: { ...textStyles.labelSmall, color: colors.primary, marginTop: spacing.xs },
  // SCRUM-232: input pairs become a single column on small devices.
  contentCompact: { paddingHorizontal: spacing.md },
  measurementsCompact: { flexDirection: "column", gap: 0 },
  cardCompact: { padding: spacing.md },
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  loader: { marginTop: spacing.xl },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { ...textStyles.subheading, color: colors.text },
  cardHint: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  measurements: { flexDirection: "row", gap: spacing.sm },
  field: { flex: 1, minWidth: 0, marginBottom: spacing.md },
  fieldLabel: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  input: {
    ...textStyles.body,
    color: colors.text,
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.sm,
  },
  unit: { ...textStyles.caption, color: colors.muted },
  sectionTitle: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  result: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  resultLabel: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  calorie: {
    ...textStyles.heading,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  kcal: { ...textStyles.bodySmall, color: colors.muted },
  resultNote: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  healthSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  healthLoader: { marginVertical: spacing.lg },
  healthMessage: {
    ...textStyles.bodySmall,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});
