import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
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
import {
  ActivityLevel,
  createNutritionProfileApi,
  Gender,
  NutritionApiError,
  NutritionProfileInput,
  NutritionProfileResult,
} from "./nutritionProfileApi";

type Props = { apiBaseUrl: string; userId: string };

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
  userId,
}: Props): React.JSX.Element {
  const api = createNutritionProfileApi(apiBaseUrl, userId);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
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
    setLoading(true);
    api
      .get()
      .then((data) => {
        if (!active) return;
        setHeight(String(data.profile.height));
        setWeight(String(data.profile.weight));
        setAge(String(data.profile.age));
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
  }, [apiBaseUrl, userId]);

  const save = async (): Promise<void> => {
    const parsedHeight = Number(height);
    const parsedWeight = Number(weight);
    const parsedAge = Number(age);
    if (
      !Number.isFinite(parsedHeight) ||
      parsedHeight <= 0 ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0 ||
      !Number.isInteger(parsedAge) ||
      parsedAge <= 0
    ) {
      setError("Nhập chiều cao, cân nặng và tuổi là các số dương hợp lệ.");
      return;
    }

    const profile: NutritionProfileInput = {
      height: parsedHeight,
      weight: parsedWeight,
      age: parsedAge,
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
    } catch {
      setError("Không thể lưu hồ sơ. Vui lòng kiểm tra kết nối và thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
                label="Tuổi"
                unit="năm"
                value={age}
                onChangeText={setAge}
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
                disabled={saving}
                onPress={save}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressed,
                  saving && styles.disabled,
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
});
