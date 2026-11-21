import React, { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
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
import { authErrorMessage } from "./authError";
import { AppIcon, colors, typography } from "../../theme";

type AuthNavigation = { navigate: (screen: "Login") => void };
type Props = {
  navigation?: AuthNavigation;
  onSubmit?: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<void>;
};

export default function RegisterScreen({
  navigation,
  onSubmit,
}: Props): React.JSX.Element {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const enteredEmail = email.trim();
  const registrationEmail = enteredEmail.includes("@") ? enteredEmail : `${enteredEmail}@gmail.com`;

  const submit = async (): Promise<void> => {
    if (fullName.trim().length < 2) return setError("Vui lòng nhập họ tên ít nhất 2 ký tự.");
    if (!/^\S+@\S+\.\S+$/.test(registrationEmail))
      return setError("Vui lòng nhập địa chỉ email hợp lệ.");
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
      return setError("Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.");
    if (password !== confirmPassword)
      return setError("Mật khẩu xác nhận không khớp.");
    if (!agreed) return setError("Vui lòng đồng ý với điều khoản để tiếp tục.");
    setError("");
    setLoading(true);
    try {
      await onSubmit?.(fullName.trim(), registrationEmail.toLowerCase(), password);
    } catch (registrationError) {
      setError(authErrorMessage(registrationError, "Không thể đăng ký. Vui lòng thử lại."));
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
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại đăng nhập" onPress={() => navigation?.navigate("Login")} style={styles.backButton}>
            <AppIcon icon={ArrowLeft} color="#2F6B5F" />
            <Text style={styles.backText}>Quay lại</Text>
          </Pressable>
          <Text style={styles.title}>Đăng ký</Text>
          <TextInput
            onChangeText={setFullName}
            placeholder="Họ và tên"
            placeholderTextColor="#8B949E"
            style={styles.input}
            value={fullName}
          />
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
          <View style={styles.passwordRow}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setConfirmPassword}
              placeholder="Xác nhận mật khẩu"
              placeholderTextColor="#8B949E"
              secureTextEntry={!showConfirmPassword}
              style={styles.passwordInput}
              value={confirmPassword}
            />
            <Pressable
              accessibilityLabel={showConfirmPassword ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"}
              accessibilityRole="button"
              onPress={() => setShowConfirmPassword((value) => !value)}
              style={styles.visibilityButton}
            >
              {showConfirmPassword ? <EyeOff color="#2F6B5F" size={21} /> : <Eye color="#2F6B5F" size={21} />}
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed((value) => !value)}
            style={styles.terms}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              Tôi đồng ý với Điều khoản và Quyền riêng tư.
            </Text>
          </Pressable>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Pressable
            disabled={loading}
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Đăng ký</Text>
            )}
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1 },
  content: { alignSelf: "center", flexGrow: 1, maxWidth: 560, padding: 24, width: "100%" },
  backButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12 },
  backText: { color: "#2F6B5F", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  title: { ...typography.pageTitle, color: colors.text, marginBottom: 24, marginTop: 30 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE3DE",
    borderRadius: 12,
    borderWidth: 1,
    color: "#17211F",
    fontSize: typography.body.fontSize,
    marginBottom: 12,
    padding: 16,
  },
  emailRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 12 },
  emailInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, minWidth: 0, padding: 16 },
  emailSuffix: { color: "#68736F", fontSize: typography.body.fontSize, paddingRight: 16 },
  passwordRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE3DE",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
  },
  passwordInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, padding: 16 },
  visibilityButton: { padding: 16 },
  terms: { alignItems: "center", flexDirection: "row", marginVertical: 8 },
  checkbox: {
    alignItems: "center",
    borderColor: "#B6C3BC",
    borderRadius: 5,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    marginRight: 10,
    width: 22,
  },
  checkboxChecked: { backgroundColor: "#2F6B5F", borderColor: "#2F6B5F" },
  checkmark: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  termsText: { color: "#68736F", flex: 1, fontSize: typography.bodySmall.fontSize },
  error: { color: "#B42318", fontSize: typography.bodySmall.fontSize, marginVertical: 8 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2F6B5F",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 54,
    marginTop: 14,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  pressed: { opacity: 0.8 },
});
