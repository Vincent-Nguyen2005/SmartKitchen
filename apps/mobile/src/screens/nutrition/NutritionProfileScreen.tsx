import { useSession } from "../../services/session";
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
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


const activityOptions: {
  value: ActivityLevel;
  label: string;
  detail: string;
}[] = [
  {
    value: "SEDENTARY",
    label: "Ít vận động",
    detail: "Chủ yếu ngồi, ít tập luyện",
  },
  {
    value: "LIGHTLY_ACTIVE",
    label: "Vận động nhẹ",
    detail: "Tập nhẹ 1-3 ngày/tuần",
  },
  {
    value: "MODERATELY_ACTIVE",
    label: "Vừa phải",
    detail: "Tập 3-5 ngày/tuần",
  },
  { value: "ACTIVE", label: "Năng động", detail: "Tập 6-7 ngày/tuần" },
  {
    value: "VERY_ACTIVE",
    label: "Rất năng động",
    detail: "Tập nặng hoặc lao động thể lực",
  },
];

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
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<Gender>("FEMALE");
  const [activityLevel, setActivityLevel] =
    useState<ActivityLevel>("SEDENTARY");
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
        setHeight(String(data.profile.height));
        setWeight(String(data.profile.weight));
        const profileBirthYear = data.profile.birthYear;
        setBirthYear(
          profileBirthYear === undefined ? "" : String(profileBirthYear),
        );
        setGender(data.profile.gender);
        setActivityLevel(data.profile.activityLevel);
        setResult(data);
        setHasProfile(true);
        setError(
          profileBirthYear === undefined && data.profile.age !== undefined
            ? "Hồ sơ hiện chưa có năm sinh. Vui lòng nhập năm sinh trước khi lưu."
            : "",
        );
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

  const save = async (): Promise<void> => {
    if (!api) {
      const message = "Vui lòng đăng nhập để lưu hồ sơ dinh dưỡng.";
      setError(message);
      Alert.alert("Cần đăng nhập", message);
      return;
    }

    const parseNumber = (value: string): number =>
      Number(value.trim().replace(",", "."));
    const parsedHeight = parseNumber(height);
    const parsedWeight = parseNumber(weight);
    const parsedBirthYear = parseNumber(birthYear);
    const currentYear = new Date().getFullYear();
    if (
      !Number.isFinite(parsedHeight) ||
      parsedHeight <= 0 ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0 ||
      !Number.isInteger(parsedBirthYear) ||
      parsedBirthYear < currentYear - 130 ||
      parsedBirthYear > currentYear
    ) {
      setError("Nhập chiều cao, cân nặng và năm sinh hợp lệ.");
      return;
    }

    const profile: NutritionProfileInput = {
      height: parsedHeight,
      weight: parsedWeight,
      birthYear: parsedBirthYear,
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
          <View style={styles.header}>
            <Text style={styles.eyebrow}>DINH DƯỠNG CÁ NHÂN</Text>
            <Text style={styles.title}>Hồ sơ dinh dưỡng</Text>
            <Text style={styles.subtitle}>
              Cập nhật thông tin để tính nhu cầu năng lượng phù hợp với bạn.
            </Text>
          </View>

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
                    onChangeText={setHeight}
                  />
                  <NumberField
                    label="Cân nặng"
                    unit="kg"
                    value={weight}
                    onChangeText={setWeight}
                  />
                </View>
                <NumberField
                  label="Năm sinh"
                  unit="năm"
                  value={birthYear}
                  onChangeText={setBirthYear}
                />

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

              <View style={[styles.formCard, isCompact && styles.cardCompact]}>
                <Text style={styles.cardTitle}>Mức độ vận động</Text>
                <Text style={styles.cardHint}>
                  Chọn mức độ gần nhất với sinh hoạt của bạn.
                </Text>
                <View style={styles.activityList}>
                  {activityOptions.map((option) => (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activityLevel === option.value }}
                      onPress={() => setActivityLevel(option.value)}
                      style={({ pressed }) => [
                        styles.activityOption,
                        activityLevel === option.value && styles.activitySelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.radioOuter}>
                        {activityLevel === option.value && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <View style={styles.activityCopy}>
                        <Text style={styles.activityLabel}>{option.label}</Text>
                        <Text style={styles.activityDetail}>{option.detail}</Text>
                      </View>
                    </Pressable>
                  ))}
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

  const toggle = (
    id: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
  ): void => {
    setSelected(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
    setMessage("");
  };

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
          {allergies.length === 0 ? (
            <Text style={styles.healthEmpty}>Chưa có danh mục dị ứng.</Text>
          ) : (
            allergies.map((option) => (
              <HealthOptionButton
                key={option.id}
                option={option}
                selected={selectedAllergies.includes(option.id)}
                onPress={() =>
                  toggle(option.id, selectedAllergies, setSelectedAllergies)
                }
              />
            ))
          )}
          <Text style={styles.healthGroupTitle}>Bệnh lý / tình trạng sức khỏe</Text>
          {conditions.length === 0 ? (
            <Text style={styles.healthEmpty}>Chưa có danh mục bệnh lý.</Text>
          ) : (
            conditions.map((option) => (
              <HealthOptionButton
                key={option.id}
                option={option}
                selected={selectedConditions.includes(option.id)}
                onPress={() =>
                  toggle(option.id, selectedConditions, setSelectedConditions)
                }
              />
            ))
          )}
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

function HealthOptionButton({
  option,
  selected,
  onPress,
}: {
  option: HealthOption;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.healthOption,
        selected && styles.healthOptionSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? <AppIcon icon={Check} size="sm" color={colors.primaryText} /> : null}
      </View>
      <View style={styles.healthOptionCopy}>
        <Text style={styles.healthOptionName}>{option.name}</Text>
        {option.description ? (
          <Text style={styles.healthOptionDescription}>{option.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChangeText,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          accessibilityLabel={label}
          keyboardType={unit === "năm" ? "number-pad" : "decimal-pad"}
          onChangeText={onChangeText}
          value={value}
          placeholder="0"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
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
  header: { marginBottom: spacing.lg },
  eyebrow: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  title: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.sm,
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
  activityList: { gap: spacing.sm },
  activityOption: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activitySelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  activityCopy: { flex: 1, minWidth: 0 },
  activityLabel: { ...textStyles.labelSmall, color: colors.text },
  activityDetail: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
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
  healthEmpty: {
    ...textStyles.caption,
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  healthOption: {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: touchTarget,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  healthOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.muted,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    height: spacing.lg + spacing.xs,
    justifyContent: "center",
    width: spacing.lg + spacing.xs,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  healthOptionCopy: { flex: 1, minWidth: 0 },
  healthOptionName: { ...textStyles.labelSmall, color: colors.text },
  healthOptionDescription: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
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
