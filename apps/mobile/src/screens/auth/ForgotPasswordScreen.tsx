import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react-native";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "../../services/api";
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
  const [feedback, setFeedback] = useState("");

  const requestCode = async (): Promise<void> => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Vui lòng nhập địa chỉ email hợp lệ.");
    setError("");
    setBusy(true);
    try {
      await authApi.requestPasswordReset(email.trim().toLowerCase());
      setStep("verify");
      setFeedback("Nếu tài khoản đã xác minh tồn tại, mã sẽ được gửi tới email này. Hãy kiểm tra cả Spam.");
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
      await authApi.verifyPasswordResetCode(email.trim().toLowerCase(), code);
      setFeedback("");
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
      await authApi.confirmPasswordReset(email.trim().toLowerCase(), code, password);
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
        <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.link}>Quay lại đăng nhập</Text></Pressable>
        <Text style={styles.title}>Quên mật khẩu</Text>
        <Text style={styles.hint}>{step === "request"
          ? "Nhập email đã xác minh. Nếu tài khoản tồn tại, chúng tôi sẽ gửi mã đặt lại mật khẩu."
          : step === "verify"
            ? `Nhập mã 8 chữ số gửi tới ${email.trim().toLowerCase()}. Mã có hiệu lực 10 phút.`
            : "Mã đã được xác minh. Hãy đặt mật khẩu mới trước khi mã hết hạn."}</Text>
        {step === "request" ? <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address"
          onChangeText={setEmail} placeholder="Địa chỉ email" style={styles.input} value={email} />
          : <Text style={styles.email}>{email.trim().toLowerCase()}</Text>}
        {step === "verify" && <>
          <TextInput accessibilityLabel="Mã đặt lại mật khẩu" keyboardType="number-pad" maxLength={8}
            onChangeText={(value) => setCode(value.replace(/\D/g, ""))} placeholder="Mã 8 chữ số" style={styles.input} value={code} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void requestCode(); }}>
            <Text style={styles.link}>Gửi lại mã</Text>
          </Pressable>
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
        {!!feedback && <Text accessibilityRole="status" style={styles.feedback}>{feedback}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void (step === "request" ? requestCode() : step === "verify" ? verifyCode() : confirm()); }} style={styles.button}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{step === "request" ? "Gửi mã đặt lại" : step === "verify" ? "Xác minh mã" : "Đổi mật khẩu"}</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1, padding: 24 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginBottom: 12, marginTop: 30 },
  hint: { color: "#68736F", fontSize: 15, lineHeight: 23, marginBottom: 24 },
  email: { color: "#2F6B5F", fontSize: 15, fontWeight: "600", marginBottom: 16 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, color: "#17211F", fontSize: 16, marginBottom: 12, padding: 16 },
  passwordRow: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, flexDirection: "row", marginBottom: 12, paddingRight: 16 },
  passwordInput: { color: "#17211F", flex: 1, fontSize: 16, padding: 16 },
  link: { color: "#2F6B5F", fontSize: 14, fontWeight: "700", paddingVertical: 8 },
  error: { color: "#B42318", fontSize: 13, marginVertical: 8 },
  feedback: { color: "#2F6B5F", fontSize: 13, marginVertical: 8 },
  button: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", minHeight: 54, marginTop: 18 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
