import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiFamilySettings } from "../../services/api";

type Props = {
  settings: ApiFamilySettings | null;
  onSave: (settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) => Promise<void>;
  onBack: () => void;
};

const settingList = (value: string): string[] =>
  value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export default function FamilySettingsScreen({ settings, onSave, onBack }: Props): React.JSX.Element {
  const [restrictions, setRestrictions] = useState(settings?.defaultDietaryRestrictions.join("\n") ?? "");
  const [currency, setCurrency] = useState(settings?.currency ?? "USD");
  const [monthlyBudget, setMonthlyBudget] = useState(settings?.monthlyBudget?.toString() ?? "");
  const [householdRules, setHouseholdRules] = useState(settings?.householdRules.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setRestrictions(settings?.defaultDietaryRestrictions.join("\n") ?? "");
    setCurrency(settings?.currency ?? "USD");
    setMonthlyBudget(settings?.monthlyBudget?.toString() ?? "");
    setHouseholdRules(settings?.householdRules.join("\n") ?? "");
  }, [settings]);

  const save = async (): Promise<void> => {
    const normalizedCurrency = currency.trim().toUpperCase();
    const budget = monthlyBudget.trim() ? Number(monthlyBudget) : null;
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setError("Enter a three-letter currency code, such as USD.");
      return;
    }
    if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 99999999.99)) {
      setError("Enter a valid non-negative monthly budget.");
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onSave({
        defaultDietaryRestrictions: settingList(restrictions),
        currency: normalizedCurrency,
        monthlyBudget: budget,
        householdRules: settingList(householdRules),
      });
      setSaved(true);
    } catch {
      setError("Could not save family settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.link}>‹  Family</Text></Pressable>
        <Text style={styles.eyebrow}>HOUSEHOLD PREFERENCES</Text>
        <Text style={styles.title}>Family settings</Text>
        <Text style={styles.subtitle}>Set shared food preferences, a household budget, and family rules.</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {saved && <Text accessibilityRole="alert" style={styles.success}>Family settings saved.</Text>}

        <View style={styles.card}>
          <Text style={styles.label}>Dietary restrictions</Text>
          <Text style={styles.hint}>Enter one restriction per line, such as vegetarian or peanut-free.</Text>
          <TextInput
            accessibilityLabel="Default dietary restrictions"
            multiline
            onChangeText={setRestrictions}
            placeholder={"Vegetarian\nPeanut-free"}
            style={[styles.input, styles.multiline]}
            value={restrictions}
          />

          <Text style={styles.label}>Currency</Text>
          <TextInput
            accessibilityLabel="Family currency"
            autoCapitalize="characters"
            maxLength={3}
            onChangeText={setCurrency}
            placeholder="USD"
            style={styles.input}
            value={currency}
          />

          <Text style={styles.label}>Monthly budget</Text>
          <TextInput
            accessibilityLabel="Monthly budget"
            keyboardType="decimal-pad"
            onChangeText={setMonthlyBudget}
            placeholder="No limit"
            style={styles.input}
            value={monthlyBudget}
          />

          <Text style={styles.label}>Household rules</Text>
          <Text style={styles.hint}>Enter one rule per line.</Text>
          <TextInput
            accessibilityLabel="Household rules"
            multiline
            onChangeText={setHouseholdRules}
            placeholder={"Ask before using shared groceries\nClean up after cooking"}
            style={[styles.input, styles.multiline]}
            value={householdRules}
          />
        </View>

        <Pressable disabled={saving} onPress={() => { void save(); }} style={[styles.saveButton, saving && styles.disabled]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save settings</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  backButton: { alignSelf: "flex-start", marginBottom: 24, paddingVertical: 6 },
  link: { color: "#2F6B5F", fontSize: 15, fontWeight: "700" },
  eyebrow: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginTop: 8 },
  subtitle: { color: "#68736F", fontSize: 15, lineHeight: 22, marginBottom: 22, marginTop: 8 },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 14, padding: 12 },
  success: { backgroundColor: "#E4F0E9", borderRadius: 10, color: "#2F6B5F", marginBottom: 14, padding: 12 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, padding: 18 },
  label: { color: "#17211F", fontSize: 14, fontWeight: "700", marginBottom: 6, marginTop: 16 },
  hint: { color: "#7A8580", fontSize: 12, lineHeight: 18, marginBottom: 8 },
  input: { borderColor: "#D7E0D9", borderRadius: 10, borderWidth: 1, color: "#17211F", fontSize: 15, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  saveButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", marginTop: 20, minHeight: 50 },
  disabled: { opacity: 0.65 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
