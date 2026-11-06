import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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

type Props = { apiBaseUrl: string; accessToken?: string };

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

export default function NutritionProfileScreen({
  apiBaseUrl,
  accessToken,
}: Props): React.JSX.Element {
  const api = useMemo(
    () =>
      accessToken
        ? createNutritionProfileApi(apiBaseUrl, accessToken)
        : undefined,
    [accessToken, apiBaseUrl],
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
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>DINH DƯỠNG CÁ NHÂN</Text>
          <Text style={styles.title}>Hồ sơ thể chất</Text>
          <Text style={styles.subtitle}>
            Thông tin của bạn giúp ước tính nhu cầu năng lượng mỗi ngày.
          </Text>

          {loading ? (
            <ActivityIndicator color="#28735D" style={styles.loader} />
          ) : (
            <>
              <View style={styles.measurements}>
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

              <Text style={styles.sectionTitle}>Mức độ vận động</Text>
              <View style={styles.activityList}>
                {activityOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: activityLevel === option.value,
                    }}
                    onPress={() => setActivityLevel(option.value)}
                    style={[
                      styles.activityOption,
                      activityLevel === option.value && styles.activitySelected,
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

              {!!error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={saving || !api}
                onPress={save}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  (saving || !api) && styles.disabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Lưu và tính toán</Text>
                )}
              </Pressable>

              {result && (
                <View accessibilityLiveRegion="polite" style={styles.result}>
                  <Text style={styles.resultLabel}>NHU CẦU CALO HÀNG NGÀY</Text>
                  <Text style={styles.calorie}>
                    {result.tdee.toLocaleString("vi-VN")}{" "}
                    <Text style={styles.kcal}>kcal</Text>
                  </Text>
                  <Text style={styles.resultNote}>
                    TDEE ước tính • BMR {result.bmr.toLocaleString("vi-VN")}{" "}
                    kcal
                  </Text>
                </View>
              )}
            </>
          )}
          {accessToken ? (
            <HealthPreferencesSection
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HealthPreferencesSection({
  apiBaseUrl,
  accessToken,
}: {
  apiBaseUrl: string;
  accessToken: string;
}): React.JSX.Element {
  const api = createHealthPreferencesApi(apiBaseUrl, accessToken);
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
  }, [apiBaseUrl, accessToken]);

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
    <View style={styles.healthSection}>
      <Text style={styles.sectionTitle}>Dị ứng và bệnh lý</Text>
      <Text style={styles.healthNote}>
        Các lựa chọn này được dùng để loại món có metadata trùng khớp khỏi gợi ý.
      </Text>
      {loading ? (
        <ActivityIndicator color="#28735D" style={styles.healthLoader} />
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
              <ActivityIndicator color="#FFFFFF" />
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
      style={[styles.healthOption, selected && styles.healthOptionSelected]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
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
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          value={value}
          placeholder="0"
          placeholderTextColor="#9AA49E"
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
      style={[styles.genderChoice, selected && styles.genderSelected]}
    >
      <View style={styles.radioOuter}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.genderText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F4F7F2" },
  flex: { flex: 1 },
  content: { padding: 22, paddingBottom: 36 },
  eyebrow: {
    color: "#28735D",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 8,
  },
  title: { color: "#182A24", fontSize: 30, fontWeight: "800", marginTop: 10 },
  subtitle: {
    color: "#65746C",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
    marginTop: 7,
  },
  loader: { marginTop: 50 },
  measurements: { flexDirection: "row", gap: 12 },
  field: { flex: 1, marginBottom: 14 },
  fieldLabel: {
    color: "#35463E",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E1D9",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 13,
  },
  input: { color: "#182A24", flex: 1, fontSize: 17, paddingVertical: 12 },
  unit: { color: "#738078", fontSize: 13, fontWeight: "600" },
  sectionTitle: {
    color: "#35463E",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 9,
    marginTop: 10,
  },
  genderRow: { flexDirection: "row", gap: 10 },
  genderChoice: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E1D9",
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  genderSelected: { backgroundColor: "#E8F2EC", borderColor: "#28735D" },
  genderText: { color: "#263A31", fontSize: 14, fontWeight: "700" },
  radioOuter: {
    alignItems: "center",
    borderColor: "#829188",
    borderRadius: 10,
    borderWidth: 1.5,
    height: 19,
    justifyContent: "center",
    width: 19,
  },
  radioInner: {
    backgroundColor: "#28735D",
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  activityList: { gap: 7 },
  activityOption: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E0E6E0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activitySelected: { backgroundColor: "#EAF3ED", borderColor: "#5D9A7B" },
  activityCopy: { flex: 1 },
  activityLabel: { color: "#263A31", fontSize: 13, fontWeight: "700" },
  activityDetail: { color: "#738078", fontSize: 11, marginTop: 3 },
  error: { color: "#B42318", fontSize: 13, lineHeight: 18, marginTop: 12 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#28735D",
    borderRadius: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
  },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.6 },
  result: {
    backgroundColor: "#183D32",
    borderRadius: 10,
    marginTop: 16,
    padding: 18,
  },
  resultLabel: {
    color: "#C1D8CB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  calorie: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginTop: 8 },
  kcal: { color: "#B9D1C3", fontSize: 15, fontWeight: "700" },
  resultNote: { color: "#D1E0D7", fontSize: 12, marginTop: 4 },
  healthSection: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E0E6E0",
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 22,
    padding: 15,
  },
  healthNote: { color: "#65746C", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  healthLoader: { marginVertical: 18 },
  healthGroupTitle: {
    color: "#35463E",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 12,
  },
  healthEmpty: { color: "#738078", fontSize: 12, paddingVertical: 8 },
  healthOption: {
    alignItems: "center",
    borderColor: "#E0E6E0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  healthOptionSelected: { backgroundColor: "#EAF3ED", borderColor: "#5D9A7B" },
  checkbox: {
    alignItems: "center",
    borderColor: "#829188",
    borderRadius: 4,
    borderWidth: 1.5,
    height: 19,
    justifyContent: "center",
    width: 19,
  },
  checkboxSelected: { backgroundColor: "#28735D", borderColor: "#28735D" },
  checkmark: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", lineHeight: 15 },
  healthOptionCopy: { flex: 1 },
  healthOptionName: { color: "#263A31", fontSize: 13, fontWeight: "700" },
  healthOptionDescription: { color: "#738078", fontSize: 11, marginTop: 3 },
  healthMessage: { color: "#28735D", fontSize: 12, lineHeight: 18, marginTop: 8 },
  healthSave: {
    alignItems: "center",
    backgroundColor: "#28735D",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 46,
  },
  healthSaveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
