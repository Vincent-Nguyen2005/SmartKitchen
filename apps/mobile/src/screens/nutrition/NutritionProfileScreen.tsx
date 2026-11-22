import { useSession } from "../../services/session";
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  TextInput,
  View,
} from "react-native";
import { DateField } from "../admin/DateField";
import { TagInput } from "../../components/TagInput";
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


/** The calorie calculation uses light activity by default (the section was removed; existing profiles keep theirs). */
const DEFAULT_ACTIVITY: ActivityLevel = "LIGHTLY_ACTIVE";
const MIN_BIRTH_DATE = "1900-01-01";
const HEIGHT_RANGE = { min: 50, max: 250 };
const WEIGHT_RANGE = { min: 2, max: 300 };

const pad2 = (value: number) => String(value).padStart(2, "0");
const isoDay = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const todayIso = () => isoDay(new Date());

/** Full years between a YYYY-MM-DD birth date and today. */
export function ageFrom(birthDate: string, today: string = todayIso()): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!birth || !now) return null;
  let age = Number(now[1]) - Number(birth[1]);
  if (`${now[2]}-${now[3]}` < `${birth[2]}-${birth[3]}`) age -= 1;
  return age;
}

/** The API stores only the age: an existing profile is shown with the birth date that gives that age today. */
const birthDateForAge = (age: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  return isoDay(date);
};

/** Decimal text: "," becomes ".", digits and one dot only, at most 2 decimals. */
export function normalizeDecimal(value: string): string {
  const cleaned = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

const rangeError = (text: string, range: { min: number; max: number }, unit: string): string | null => {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= range.min && value <= range.max ? null : `Nhập từ ${range.min} đến ${range.max} ${unit}.`;
};

export default function NutritionProfileScreen(): React.JSX.Element {
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
        setHeight(normalizeDecimal(String(data.profile.height)));
        setWeight(normalizeDecimal(String(data.profile.weight)));
        setBirthDate(typeof data.profile.age === "number" ? birthDateForAge(data.profile.age) : "");
        setGender(data.profile.gender);
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

  const heightError = rangeError(height, HEIGHT_RANGE, "cm");
  const weightError = rangeError(weight, WEIGHT_RANGE, "kg");
  const age = ageFrom(birthDate);

  const save = async (): Promise<void> => {
    if (!api) {
      const message = "Vui lòng đăng nhập để lưu hồ sơ dinh dưỡng.";
      setError(message);
      Alert.alert("Cần đăng nhập", message);
      return;
    }

    setSubmitted(true);
    const parsedHeight = Number(height);
    const parsedWeight = Number(weight);
    const age = ageFrom(birthDate);
    if (!height.trim() || !weight.trim() || heightError || weightError || age === null || age < 1 || age > 130) {
      setError(age !== null && age < 1 ? "Ngày sinh phải cách hôm nay ít nhất 1 năm." : "Nhập chiều cao, cân nặng và ngày sinh hợp lệ.");
      return;
    }

    const profile: NutritionProfileInput = {
      height: parsedHeight,
      weight: parsedWeight,
      // nutrition-service stores the age (not the date); it is recomputed from the picked birth date on each save.
      age,
      gender,
      activityLevel,
    };
    setSaving(true);
    setError("");
    try {
      const data = hasProfile
        ? await api.update(profile)
        : await api.create(profile);
      setResult(data);
      setHasProfile(true);
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error && saveError.message
          ? saveError.message
          : typeof saveError === "string" && saveError
            ? saveError
            : "Đã xảy ra lỗi không xác định.";
      const responseData =
        saveError instanceof NutritionApiError
          ? saveError.responseData
          : undefined;
      const status =
        saveError instanceof NutritionApiError ? saveError.status : undefined;
      console.error("Failed to save nutrition profile.", {
        status,
        responseData,
        message,
      });

      const responseDetails =
        responseData === undefined
          ? ""
          : `\n${JSON.stringify(responseData, null, 2)}`;
      const alertMessage = [
        message || "Đã xảy ra lỗi không xác định.",
        status === undefined ? "" : `(HTTP ${status})`,
        responseDetails,
      ]
        .filter(Boolean)
        .join(" ");
      setError(`Không thể lưu hồ sơ. ${message}`);
      Alert.alert("Không lưu được hồ sơ dinh dưỡng", alertMessage);
    } finally {
      setSaving(false);
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
                    unit="cm"
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
                      suggestedDate={birthDateForAge(25)}
                      emptyHint="Chọn ngày sinh để tính tuổi."
                    />
                  </View>
                  {age !== null && age >= 0 && <Text style={styles.ageText}>{age} tuổi</Text>}
                </View>

                <Text style={styles.sectionTitle}>Giới tính</Text>
                <View style={styles.genderRow}>
                  <ChoiceButton
                    label="Nữ"
                    selected={gender === "FEMALE"}
                    onPress={() => setGender("FEMALE")}
                  />
                  <ChoiceButton
                    label="Nam"
                    selected={gender === "MALE"}
                    onPress={() => setGender("MALE")}
                  />
                </View>
              </View>

              {!!error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={saving || !api}
                onPress={() => void save()}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  (saving || !api) && styles.disabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.saveText}>Lưu và tính nhu cầu calo</Text>
                )}
              </Pressable>

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

          {accessToken ? (
            <HealthPreferencesSection
              compact={isCompact}
              accessToken={accessToken}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HealthPreferencesSection({
  compact,
  accessToken,
}: {
  compact: boolean;
  accessToken: string;
}): React.JSX.Element {
  const api = createHealthPreferencesApi(accessToken);
  const [allergies, setAllergies] = useState<HealthOption[]>([]);
  const [conditions, setConditions] = useState<HealthOption[]>([]);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.getAllergies(), api.getConditions(), api.getSelection()])
      .then(([allergyOptions, conditionOptions, selection]) => {
        if (!active) return;
        setAllergies(allergyOptions);
        setConditions(conditionOptions);
        setSelectedAllergies(selection.allergies.map(({ id }) => id));
        setSelectedConditions(selection.healthConditions.map(({ id }) => id));
      })
      .catch(() => {
        if (active) setMessage("Không thể tải dị ứng và bệnh lý đã khai báo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  const namesOf = (ids: string[], options: HealthOption[]) => ids.flatMap((id) => options.find((option) => option.id === id)?.name ?? []);
  const idsOf = (names: string[], options: HealthOption[]) => names.flatMap((name) => options.find((option) => option.name === name)?.id ?? []);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage("");
    try {
      const selection = await api.saveSelection(
        selectedAllergies,
        selectedConditions,
      );
      setSelectedAllergies(selection.allergies.map(({ id }) => id));
      setSelectedConditions(selection.healthConditions.map(({ id }) => id));
      setMessage("Đã lưu hồ sơ sức khỏe.");
    } catch {
      setMessage("Không thể lưu hồ sơ sức khỏe. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.healthSection, compact && styles.cardCompact]}>
      <Text style={styles.sectionTitle}>Dị ứng và bệnh lý</Text>
      <Text style={styles.healthNote}>
        Các lựa chọn này được dùng để loại món có metadata trùng khớp khỏi gợi ý.
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.healthLoader} />
      ) : (
        <>
          <Text style={styles.healthGroupTitle}>Dị ứng</Text>
          <TagInput
            tags={namesOf(selectedAllergies, allergies)}
            onChange={(names) => { setSelectedAllergies(idsOf(names, allergies)); setMessage(""); }}
            suggestions={allergies.map((option) => option.name)}
            allowFreeText={false}
            accessibilityLabel="Thêm dị ứng"
            placeholder={allergies.length ? "Gõ để tìm, ví dụ: sữa, hải sản" : "Chưa có danh mục dị ứng."}
          />
          <Text style={styles.healthGroupTitle}>Bệnh lý / tình trạng sức khỏe</Text>
          <TagInput
            tags={namesOf(selectedConditions, conditions)}
            onChange={(names) => { setSelectedConditions(idsOf(names, conditions)); setMessage(""); }}
            suggestions={conditions.map((option) => option.name)}
            allowFreeText={false}
            accessibilityLabel="Thêm bệnh lý"
            placeholder={conditions.length ? "Gõ để tìm trong danh mục" : "Chưa có danh mục bệnh lý."}
          />
          {!!message && (
            <Text accessibilityRole="alert" style={styles.healthMessage}>
              {message}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void save()}
            style={[styles.healthSave, saving && styles.disabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.healthSaveText}>Lưu hồ sơ sức khỏe</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChangeText,
  error,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
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
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function ChoiceButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.genderChoice,
        selected && styles.genderSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.radioOuter}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.genderText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  birthRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  birthField: { flex: 1 },
  ageText: { ...textStyles.label, color: colors.primary },
  fieldError: { ...textStyles.caption, color: colors.danger, marginTop: spacing.xs },
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
  genderRow: { flexDirection: "row", gap: spacing.sm },
  genderChoice: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  genderSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  genderText: { ...textStyles.labelSmall, color: colors.text },
  radioOuter: {
    alignItems: "center",
    borderColor: colors.muted,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: spacing.lg,
    justifyContent: "center",
    width: spacing.lg,
  },
  radioInner: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: spacing.sm,
    width: spacing.sm,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  saveText: { ...textStyles.labelSmall, color: colors.primaryText },
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
  healthNote: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  healthLoader: { marginVertical: spacing.lg },
  healthGroupTitle: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  healthMessage: {
    ...textStyles.bodySmall,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  healthSave: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: touchTarget + spacing.xs,
  },
  healthSaveText: { ...textStyles.labelSmall, color: colors.primaryText },
});
