import React, { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "../../services/api";
import { AppIcon, colors, typography } from "../../theme";
import { authErrorMessage } from "./authError";

type Props = { onBack: () => void; onSuccess: () => void };

export default function ForgotPasswordScreen({ onBack, onSuccess }: Props): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"request" | "verify" | "password">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enteredEmail = email.trim();
  const resetEmail = (enteredEmail.includes("@") ? enteredEmail : `${enteredEmail}@gmail.com`).toLowerCase();

  const requestCode = async (): Promise<void> => {
    if (!/^\S+@\S+\.\S+$/.test(resetEmail)) return setError("Vui lòng nhập địa chỉ email hợp lệ.");
    setError("");
    setBusy(true);
    try {
      await authApi.requestPasswordReset(resetEmail);
      setStep("verify");
    } catch (cause) {
      setError(authErrorMessage(cause, "Không thể yêu cầu đặt lại mật khẩu. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (): Promise<void> => {
    if (!/^\d{8}$/.test(code)) return setError("Vui lòng nhập mã 8 chữ số trong email.");
    setError("");
    setBusy(true);
    try {
      await authApi.verifyPasswordResetCode(resetEmail, code);
      setStep("password");
    } catch (cause) {
      setError(authErrorMessage(cause, "Không thể xác minh mã. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (): Promise<void> => {
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
      return setError("Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.");
    if (password !== confirmPassword) return setError("Mật khẩu xác nhận không khớp.");
    setError("");
    setBusy(true);
    try {
      await authApi.confirmPasswordReset(resetEmail, code, password);
      onSuccess();
    } catch (cause) {
      setError(authErrorMessage(cause, "Không thể đặt lại mật khẩu. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại đăng nhập" onPress={onBack} style={styles.backButton}>
          <AppIcon icon={ArrowLeft} color="#2F6B5F" />
          <Text style={styles.backText}>Quay lại</Text>
        </Pressable>
        <Text style={styles.title}>Quên mật khẩu</Text>
        {step !== "request" && <Text style={styles.hint}>{step === "verify"
          ? `Nhập mã 8 số đã gửi tới ${resetEmail}. Mã có hiệu lực 10 phút.`
          : "Mã đã được xác minh. Hãy đặt mật khẩu mới trước khi mã hết hạn."}</Text>}
        {step === "request" ? <View style={styles.emailRow}>
          <TextInput accessibilityLabel="Tên email" accessibilityHint="Nếu không nhập đuôi email, hệ thống sẽ dùng @gmail.com"
            autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail}
            placeholder="Tên email" placeholderTextColor="#8B949E" style={styles.emailInput} value={email} />
          {!email.includes("@") && <Text style={styles.emailSuffix}>@gmail.com</Text>}
        </View>
          : step === "password" ? <Text style={styles.email}>{resetEmail}</Text> : null}
        {step === "verify" && <>
          <TextInput accessibilityLabel="Mã đặt lại mật khẩu" keyboardType="number-pad" maxLength={8}
            onChangeText={(value) => setCode(value.replace(/\D/g, ""))} placeholder="Mã 8 chữ số" style={styles.input} value={code} />
          <View style={styles.resendRow}>
            <Text style={styles.resendHint}>Không thấy mã? Kiểm tra cả Spam.</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void requestCode(); }} style={styles.resendButton}>
              <Text style={styles.link}>Gửi lại mã</Text>
            </Pressable>
          </View>
        </>}
        {step === "password" && <>
          <View style={styles.passwordRow}>
            <TextInput autoCapitalize="none" onChangeText={setPassword} placeholder="Mật khẩu mới" secureTextEntry={!showPassword}
              style={styles.passwordInput} value={password} />
            <Pressable accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} accessibilityRole="button"
              onPress={() => setShowPassword((value) => !value)}>
              {showPassword ? <EyeOff color="#2F6B5F" size={21} /> : <Eye color="#2F6B5F" size={21} />}
            </Pressable>
          </View>
          <TextInput autoCapitalize="none" onChangeText={setConfirmPassword} placeholder="Xác nhận mật khẩu mới"
            secureTextEntry={!showPassword} style={styles.input} value={confirmPassword} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setStep("verify"); setError(""); }}>
            <Text style={styles.link}>Nhập lại mã xác minh</Text>
          </Pressable>
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void (step === "request" ? requestCode() : step === "verify" ? verifyCode() : confirm()); }} style={styles.button}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{step === "request" ? "Gửi mã đặt lại" : step === "verify" ? "Xác minh mã" : "Đổi mật khẩu"}</Text>}
        </Pressable>
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
  title: { ...typography.pageTitle, color: colors.text, marginBottom: 12, marginTop: 30 },
  hint: { color: "#68736F", fontSize: typography.body.fontSize, lineHeight: 23, marginBottom: 24 },
  email: { color: "#2F6B5F", fontSize: typography.body.fontSize, fontWeight: "600", marginBottom: 16 },
  emailRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 12 },
  emailInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, minWidth: 0, padding: 16 },
  emailSuffix: { color: "#68736F", fontSize: typography.body.fontSize, paddingRight: 16 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, color: "#17211F", fontSize: typography.body.fontSize, marginBottom: 12, padding: 16 },
  passwordRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 12, paddingRight: 16 },
  passwordInput: { color: "#17211F", flex: 1, fontSize: typography.body.fontSize, padding: 16 },
  link: { color: "#2F6B5F", fontSize: typography.bodySmall.fontSize, fontWeight: "700", paddingVertical: 8 },
  resendRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  resendHint: { color: "#68736F", flexShrink: 1, fontSize: typography.bodySmall.fontSize },
  resendButton: { justifyContent: "center", minHeight: 44 },
  error: { color: "#B42318", fontSize: typography.bodySmall.fontSize, marginVertical: 8 },
  button: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", minHeight: 54, marginTop: 18 },
  buttonText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
});
