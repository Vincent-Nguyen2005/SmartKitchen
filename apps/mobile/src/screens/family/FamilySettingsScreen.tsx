import React, { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiFamilySettings } from "../../services/api";
import { AppIcon, colors, typography } from "../../theme";

type Props = {
  settings: ApiFamilySettings | null;
  onSave: (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => Promise<void>;
  onBack: () => void;
};

const settingList = (value: string): string[] =>
  value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

const addTags = (current: string[], value: string): string[] => {
  const tags = [...current];
  const seen = new Set(current.map((item) => item.toLowerCase()));
  for (const part of value.split(/[,，\r\n]/)) {
    const tag = part.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      tags.push(tag);
      seen.add(tag.toLowerCase());
    }
  }
  return tags;
};

export default function FamilySettingsScreen({ settings, onSave, onBack }: Props): React.JSX.Element {
  const [restrictions, setRestrictions] = useState(settings?.defaultDietaryRestrictions ?? []);
  const [tagInput, setTagInput] = useState("");
  const [householdRules, setHouseholdRules] = useState(settings?.householdRules.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRestrictions(settings?.defaultDietaryRestrictions ?? []);
    setTagInput("");
    setHouseholdRules(settings?.householdRules.join("\n") ?? "");
  }, [settings]);

  const updateTagInput = (value: string): void => {
    const parts = value.split(/[,，\r\n]/);
    if (parts.length > 1) {
      setRestrictions((current) => addTags(current, parts.slice(0, -1).join(",")));
      setTagInput(parts[parts.length - 1] ?? "");
    } else {
      setTagInput(value);
    }
    setSaved(false);
  };

  const commitTagInput = (): void => {
    setRestrictions((current) => addTags(current, tagInput));
    setTagInput("");
  };

  const save = async (): Promise<void> => {
    const dietaryRestrictions = addTags(restrictions, tagInput);
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
      setRestrictions(dietaryRestrictions);
      setTagInput("");
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
          <View style={styles.tagBox}>
            {restrictions.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <Pressable accessibilityLabel={`Xoá tag ${tag}`} accessibilityRole="button" hitSlop={6}
                  onPress={() => { setRestrictions((current) => current.filter((item) => item !== tag)); setSaved(false); }} style={styles.removeTag}>
                  <X color="#2F6B5F" size={16} />
                </Pressable>
              </View>
            ))}
            <TextInput accessibilityLabel="Thêm tag lưu ý ăn uống" autoCapitalize="sentences"
              onBlur={commitTagInput} onChangeText={updateTagInput} onSubmitEditing={commitTagInput}
              placeholder={restrictions.length ? "Thêm tag..." : "Ví dụ: ăn chay, không ăn cay"}
              placeholderTextColor="#8B949E" returnKeyType="done" style={styles.tagInput} value={tagInput} />
          </View>

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
  tagBox: { alignItems: "center", borderColor: "#D7E0D9", borderRadius: 10, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, minHeight: 52, padding: 8 },
  tag: { alignItems: "center", backgroundColor: "#E4F0E9", borderRadius: 16, flexDirection: "row", minHeight: 34, paddingLeft: 10, paddingRight: 2 },
  tagText: { color: "#2F6B5F", fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
  removeTag: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  tagInput: { color: "#17211F", flexGrow: 1, fontSize: typography.body.fontSize, minHeight: 40, minWidth: 130, paddingHorizontal: 4 },
  input: { borderColor: "#D7E0D9", borderRadius: 10, borderWidth: 1, color: "#17211F", fontSize: typography.body.fontSize, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  saveButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", marginTop: 20, minHeight: 50 },
  disabled: { opacity: 0.65 },
  saveText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
});
