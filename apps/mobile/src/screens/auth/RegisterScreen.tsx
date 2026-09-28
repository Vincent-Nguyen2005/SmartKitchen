import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AuthNavigation = { navigate: (screen: "Login") => void };
type Props = { navigation?: AuthNavigation; onSubmit?: (fullName: string, email: string, password: string) => Promise<void> };

export default function RegisterScreen({ navigation, onSubmit }: Props): React.JSX.Element {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    if (!agreed) return setError("Agree to the terms to continue.");
    setError("");
    setLoading(true);
    try { await onSubmit?.(fullName.trim(), email.trim().toLowerCase(), password); }
    catch { setError("Unable to create your account. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View>
          <Pressable onPress={() => navigation?.navigate("Login")}><Text style={styles.back}>Back to sign in</Text></Pressable>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>A better kitchen starts with everyone on the same page.</Text>
          <TextInput onChangeText={setFullName} placeholder="Full name" placeholderTextColor="#8B949E" style={styles.input} value={fullName} />
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#8B949E" style={styles.input} value={email} />
          <View style={styles.passwordRow}><TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="Password" placeholderTextColor="#8B949E" secureTextEntry={!showPassword} style={styles.passwordInput} value={password} /><Pressable onPress={() => setShowPassword((value) => !value)} style={styles.visibilityButton}><Text style={styles.visibilityText}>{showPassword ? "Hide" : "Show"}</Text></Pressable></View>
          <TextInput autoCapitalize="none" onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor="#8B949E" secureTextEntry={!showPassword} style={styles.input} value={confirmPassword} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} onPress={() => setAgreed((value) => !value)} style={styles.terms}><View style={[styles.checkbox, agreed && styles.checkboxChecked]}>{agreed && <Text style={styles.checkmark}>✓</Text>}</View><Text style={styles.termsText}>I agree to the Terms and Privacy Policy.</Text></Pressable>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable disabled={loading} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create account</Text>}</Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1, padding: 24 },
  back: { color: "#2F6B5F", fontSize: 14, fontWeight: "700", marginBottom: 28 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#68736F", fontSize: 16, lineHeight: 24, marginBottom: 24 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, color: "#17211F", fontSize: 16, marginBottom: 12, padding: 16 },
  passwordRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 12 },
  passwordInput: { color: "#17211F", flex: 1, fontSize: 16, padding: 16 },
  visibilityButton: { padding: 16 },
  visibilityText: { color: "#2F6B5F", fontWeight: "700" },
  terms: { alignItems: "center", flexDirection: "row", marginVertical: 8 },
  checkbox: { alignItems: "center", borderColor: "#B6C3BC", borderRadius: 5, borderWidth: 1, height: 22, justifyContent: "center", marginRight: 10, width: 22 },
  checkboxChecked: { backgroundColor: "#2F6B5F", borderColor: "#2F6B5F" },
  checkmark: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  termsText: { color: "#68736F", flex: 1, fontSize: 13 },
  error: { color: "#B42318", fontSize: 13, marginVertical: 8 },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", minHeight: 54, marginTop: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});