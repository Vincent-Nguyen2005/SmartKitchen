import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react-native";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiFamilySettings } from "../../services/api";
import { AppIcon, colors, typography } from "../../theme";
import { TagInput } from "../../components/TagInput";

type Props = {
  settings: ApiFamilySettings | null;
  onSave: (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => Promise<void>;
  onBack: () => void;
};

const settingList = (value: string): string[] =>
  value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export default function FamilySettingsScreen({ settings, onSave, onBack }: Props): React.JSX.Element {
  const [restrictions, setRestrictions] = useState(settings?.defaultDietaryRestrictions ?? []);
  const [householdRules, setHouseholdRules] = useState(settings?.householdRules.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRestrictions(settings?.defaultDietaryRestrictions ?? []);
    setHouseholdRules(settings?.householdRules.join("\n") ?? "");
  }, [settings]);

  const save = async (): Promise<void> => {
    const dietaryRestrictions = restrictions;
    const familyRules = settingList(householdRules);
    if (dietaryRestrictions.length > 30 || dietaryRestrictions.some((item) => item.length > 80)) {
      setError("Tối đa 30 tag ăn uống, mỗi tag không quá 80 ký tự.");
      return;
    }
    if (familyRules.length > 50 || familyRules.some((item) => item.length > 200)) {
      setError("Tối đa 50 quy ước, mỗi dòng không quá 200 ký tự.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onSave({
        defaultDietaryRestrictions: dietaryRestrictions,
        householdRules: familyRules,
      });
      setSaved(true);
    } catch {
      setError("Không thể lưu cài đặt gia đình. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại gia đình" onPress={onBack} style={styles.backButton}><AppIcon icon={ArrowLeft} color={colors.primary} /><Text style={styles.link}>Gia đình</Text></Pressable>
        <Text style={styles.title}>Cài đặt gia đình</Text>
        <Text style={styles.subtitle}>Lưu ý ăn uống và quy ước chung cho cả nhà.</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {saved && <Text accessibilityRole="alert" style={styles.success}>Đã lưu cài đặt gia đình.</Text>}

        <View style={styles.card}>
          <Text style={[styles.label, styles.firstLabel]}>Lưu ý ăn uống</Text>
          <Text style={styles.hint}>Dùng dấu phẩy hoặc Enter để thêm từng tag.</Text>
          <TagInput
            tags={restrictions}
            onChange={(tags) => { setRestrictions(tags); setSaved(false); }}
            accessibilityLabel="Thêm tag lưu ý ăn uống"
            placeholder="Ví dụ: ăn chay, không ăn cay"
          />

          <Text style={styles.label}>Quy ước gia đình</Text>
          <Text style={styles.hint}>Mỗi dòng một quy ước.</Text>
          <TextInput
            accessibilityLabel="Quy ước gia đình"
            multiline
            onChangeText={(value) => { setHouseholdRules(value); setSaved(false); }}
            placeholder={"Hỏi trước khi dùng thực phẩm chung\nDọn dẹp sau khi nấu"}
            placeholderTextColor="#8B949E"
            style={[styles.input, styles.multiline]}
            value={householdRules}
          />
        </View>

        <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void save(); }} style={[styles.saveButton, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Lưu cài đặt</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  content: { alignSelf: "center", maxWidth: 720, padding: 24, paddingBottom: 40, width: "100%" },
  backButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 8, marginBottom: 24, minHeight: 44 },
  link: { color: "#2F6B5F", fontSize: typography.body.fontSize, fontWeight: "700" },
  title: { ...typography.pageTitle, color: colors.text, marginTop: 8 },
  subtitle: { color: "#68736F", fontSize: typography.body.fontSize, lineHeight: 22, marginBottom: 22, marginTop: 8 },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 14, padding: 12 },
  success: { backgroundColor: "#E4F0E9", borderRadius: 10, color: "#2F6B5F", marginBottom: 14, padding: 12 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, padding: 18 },
  label: { color: "#17211F", fontSize: typography.bodySmall.fontSize, fontWeight: "700", marginBottom: 6, marginTop: 16 },
  firstLabel: { marginTop: 0 },
  hint: { color: "#7A8580", fontSize: typography.caption.fontSize, lineHeight: 18, marginBottom: 8 },
  input: { borderColor: "#D7E0D9", borderRadius: 10, borderWidth: 1, color: "#17211F", fontSize: typography.body.fontSize, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  saveButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", marginTop: 20, minHeight: 50 },
  disabled: { opacity: 0.65 },
  saveText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
});
