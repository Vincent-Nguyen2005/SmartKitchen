import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

type Mode = "create" | "join";
type Props = {
  onCreate?: (name: string) => Promise<void>;
  onJoin?: (code: string) => Promise<void>;
  onBack?: () => void;
};

export default function CreateOrJoinFamilyScreen({ onCreate, onJoin, onBack }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    const value = mode === "create" ? name.trim() : inviteCode.trim();
    if (mode === "create" && value.length < 2) return setError("Family name must be at least 2 characters.");
    if (mode === "join" && value.length < 6) return setError("Enter a valid invite code or link token.");
    setError("");
    setLoading(true);
    try {
      if (mode === "create") await onCreate?.(value);
      else await onJoin?.(value);
    } catch {
      setError(mode === "create" ? "Could not create your family. Please try again." : "That invite code could not be used. Check it and try again.");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View>
          {!!onBack && <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.link}>‹  Back</Text></Pressable>}
          <Text style={styles.eyebrow}>FAMILY SETUP</Text>
          <Text style={styles.title}>Make it a shared space</Text>
          <Text style={styles.subtitle}>Bring your household together to plan, shop, and cook.</Text>
          <View style={styles.tabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "create" }} onPress={() => { setMode("create"); setError(""); }} style={[styles.tab, mode === "create" && styles.activeTab]}><Text style={[styles.tabText, mode === "create" && styles.activeTabText}>Create new</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "join" }} onPress={() => { setMode("join"); setError(""); }} style={[styles.tab, mode === "join" && styles.activeTab]}><Text style={[styles.tabText, mode === "join" && styles.activeTabText}>Join a family</Text></Pressable>
          </View>
          <View style={styles.formCard}>
            {mode === "create" ? <>
              <Text style={styles.label}>What should we call your family?</Text>
              <TextInput autoCapitalize="words" maxLength={80} onChangeText={setName} placeholder="e.g. The Green Kitchen" placeholderTextColor="#8B949E" style={styles.input} value={name} />
              <Text style={styles.helper}>You’ll be the owner and can invite others after setup.</Text>
            </> : <>
              <Text style={styles.label}>Invite code or invitation token</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setInviteCode} placeholder="Enter code or token" placeholderTextColor="#8B949E" style={styles.input} value={inviteCode} />
              <Text style={styles.helper}>Ask a family owner or admin to share their invite code.</Text>
            </>}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable disabled={loading} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{mode === "create" ? "Create family" : "Join family"}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  container: { flex: 1, padding: 24 },
  backButton: { alignSelf: "flex-start", marginBottom: 28, paddingVertical: 6 },
  link: { color: "#2F6B5F", fontSize: 15, fontWeight: "700" },
  eyebrow: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.3 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginTop: 9 },
  subtitle: { color: "#68736F", fontSize: 15, lineHeight: 23, marginTop: 8 },
  tabs: { backgroundColor: "#E9EDE9", borderRadius: 12, flexDirection: "row", marginTop: 28, padding: 4 },
  tab: { alignItems: "center", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 42 },
  activeTab: { backgroundColor: "#FFFFFF", shadowColor: "#17211F", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  tabText: { color: "#68736F", fontSize: 13, fontWeight: "600" },
  activeTabText: { color: "#2F6B5F" },
  formCard: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 20 },
  label: { color: "#17211F", fontSize: 15, fontWeight: "700", marginBottom: 11 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 11, borderWidth: 1, color: "#17211F", fontSize: 16, padding: 15 },
  helper: { color: "#7A8580", fontSize: 13, lineHeight: 19, marginTop: 9 },
  error: { color: "#B42318", fontSize: 13, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", marginTop: 22, minHeight: 52 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});