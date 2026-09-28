import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AuthNavigation = { navigate: (screen: "Register" | "ForgotPassword") => void };
type Props = { navigation?: AuthNavigation; onSubmit?: (email: string, password: string) => Promise<void> };

export default function LoginScreen({ navigation, onSubmit }: Props): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setError("");
    setLoading(true);
    try {
      await onSubmit?.(email.trim().toLowerCase(), password);
    } catch {
      setError("Unable to sign in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View>
          <Text style={styles.kicker}>SMARTKITCHEN</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to keep your household in sync.</Text>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#8B949E" style={styles.input} value={email} />
          <View style={styles.passwordRow}>
            <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="Password" placeholderTextColor="#8B949E" secureTextEntry={!showPassword} style={styles.passwordInput} value={password} />
            <Pressable accessibilityRole="button" onPress={() => setShowPassword((value) => !value)} style={styles.visibilityButton}>
              <Text style={styles.visibilityText}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </Pressable>
          <Pressable onPress={() => navigation?.navigate("ForgotPassword")} style={styles.linkButton}><Text style={styles.link}>Forgot password?</Text></Pressable>
        </View>
        <Pressable onPress={() => navigation?.navigate("Register")} style={styles.footer}><Text style={styles.footerText}>New to SmartKitchen? <Text style={styles.link}>Create an account</Text></Text></Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1, justifyContent: "space-between", padding: 24 },
  kicker: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginBottom: 18 },
  title: { color: "#17211F", fontSize: 34, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#68736F", fontSize: 16, lineHeight: 24, marginBottom: 28 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, color: "#17211F", fontSize: 16, marginBottom: 14, padding: 16 },
  passwordRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 8 },
  passwordInput: { color: "#17211F", flex: 1, fontSize: 16, padding: 16 },
  visibilityButton: { paddingHorizontal: 16, paddingVertical: 16 },
  visibilityText: { color: "#2F6B5F", fontWeight: "700" },
  error: { color: "#B42318", fontSize: 13, marginBottom: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", minHeight: 54, marginTop: 10 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  linkButton: { alignItems: "center", padding: 18 },
  link: { color: "#2F6B5F", fontWeight: "700" },
  footer: { alignItems: "center", paddingVertical: 12 },
  footerText: { color: "#68736F", fontSize: 14 },
});