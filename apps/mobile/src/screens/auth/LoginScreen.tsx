import React, { useState } from "react";
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
import { ApiError } from "../../services/api";
import { authErrorMessage } from "./authError";
import { Eye, EyeOff } from "lucide-react-native";
import { colors, typography } from "../../theme";

type AuthNavigation = { navigate: (screen: "Register") => void };
type Props = {
  navigation?: AuthNavigation;
  onSubmit?: (email: string, password: string) => Promise<void>;
  onVerificationRequired?: () => void;
  onForgotPassword?: () => void;
};

export default function LoginScreen({
  navigation,
  onSubmit,
  onVerificationRequired,
  onForgotPassword,
}: Props): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    const enteredEmail = email.trim();
    const loginEmail = enteredEmail.includes("@") ? enteredEmail : `${enteredEmail}@gmail.com`;
    if (!/^\S+@\S+\.\S+$/.test(loginEmail))
      return setError("Vui lòng nhập email hợp lệ.");
    if (!password) return setError("Vui lòng nhập mật khẩu.");
    setError("");
    setLoading(true);
    try {
      await onSubmit?.(loginEmail.toLowerCase(), password);
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.code === "EMAIL_NOT_VERIFIED") onVerificationRequired?.();
      else setError(authErrorMessage(loginError, "Không thể đăng nhập. Vui lòng thử lại."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.kicker}>SMARTKITCHEN</Text>
          <Text style={styles.title}>Chào mừng trở lại</Text>
          <Text style={styles.subtitle}>
            Đăng nhập để quản lý căn bếp của gia đình.
          </Text>
          <View style={styles.emailRow}>
            <TextInput
              accessibilityLabel="Tên email"
              accessibilityHint="Nếu không nhập đuôi email, hệ thống sẽ dùng @gmail.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Tên email"
              placeholderTextColor="#8B949E"
              style={styles.emailInput}
              value={email}
            />
            {!email.includes("@") && <Text style={styles.emailSuffix}>@gmail.com</Text>}
          </View>
          <View style={styles.passwordRow}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Mật khẩu"
              placeholderTextColor="#8B949E"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable
              accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              accessibilityRole="button"
              onPress={() => setShowPassword((value) => !value)}
              style={styles.visibilityButton}
            >
              {showPassword ? <EyeOff color="#2F6B5F" size={21} /> : <Eye color="#2F6B5F" size={21} />}
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={onForgotPassword}>
            <Text style={styles.forgotPassword}>Quên mật khẩu?</Text>
          </Pressable>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Pressable
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Đăng nhập</Text>
            )}
          </Pressable>
        </View>
        <Pressable
          onPress={() => navigation?.navigate("Register")}
          style={styles.footer}
        >
          <Text style={styles.footerText}>
            Chưa có tài khoản?{" "}
            <Text style={styles.link}>Đăng ký</Text>
          </Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  forgotPassword: { alignSelf: "flex-end", color: "#2F6B5F", fontSize: typography.bodySmall.fontSize, fontWeight: "700", paddingVertical: 12 },
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "space-between", maxWidth: 560, padding: 24, width: "100%", alignSelf: "center" },
  kicker: {
    color: "#2F6B5F",
    fontSize: typography.caption.fontSize,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 18,
  },
  title: { ...typography.pageTitle, color: colors.text, marginBottom: 8 },
  subtitle: {
    color: "#68736F",
    fontSize: typography.body.fontSize,
    lineHeight: 24,
    marginBottom: 28,
  },
  emailRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE3DE",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 14,
  },
  emailInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, minWidth: 0, padding: 16 },
  emailSuffix: { color: "#68736F", fontSize: typography.body.fontSize, paddingRight: 16 },
  passwordRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE3DE",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
  },
  passwordInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, padding: 16 },
  visibilityButton: { paddingHorizontal: 16, paddingVertical: 16 },
  visibilityText: { color: "#2F6B5F", fontWeight: "700" },
  error: { color: "#B42318", fontSize: typography.bodySmall.fontSize, marginBottom: 12 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2F6B5F",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 54,
    marginTop: 10,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  link: { color: "#2F6B5F", fontWeight: "700" },
  footer: { alignItems: "center", paddingVertical: 12 },
  footerText: { color: "#68736F", fontSize: typography.bodySmall.fontSize },
});
