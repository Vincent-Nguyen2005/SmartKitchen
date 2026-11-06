import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { authErrorMessage } from "./authError";

type Props = {
  email: string;
  onVerify: (otpCode: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
};

export default function OtpVerificationScreen({
  email,
  onVerify,
  onResend,
  onBack,
}: Props): React.JSX.Element {
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = async (): Promise<void> => {
    if (!/^\d{6}$/.test(otpCode)) {
      setError("Vui lòng nhập mã 6 chữ số trong email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onVerify(otpCode);
    } catch (verificationError) {
      setError(authErrorMessage(verificationError, "Không thể xác minh tài khoản. Vui lòng thử lại."));
    } finally {
      setLoading(false);
    }
  };

  const resend = async (): Promise<void> => {
    setError("");
    setResending(true);
    try {
      await onResend();
      setCooldown(60);
    } catch (resendError) {
      setError(authErrorMessage(resendError, "Không thể gửi lại mã. Vui lòng thử lại."));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Đổi địa chỉ email</Text>
          </Pressable>
          <Text style={styles.eyebrow}>XÁC MINH EMAIL</Text>
          <Text style={styles.title}>Kiểm tra hộp thư</Text>
          <Text style={styles.subtitle}>
            Chúng tôi đã gửi mã xác minh 6 chữ số tới{"\n"}
            <Text style={styles.email}>{email}</Text>
          </Text>
          <TextInput
            accessibilityLabel="Mã xác minh email gồm 6 chữ số"
            autoComplete="one-time-code"
            autoFocus
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setOtpCode(value.replace(/\D/g, ""))}
            placeholder="------"
            placeholderTextColor="#AAB5AF"
            style={styles.codeInput}
            textContentType="oneTimeCode"
            value={otpCode}
          />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable disabled={loading} onPress={() => { void verify(); }} style={styles.primaryButton}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Xác minh tài khoản</Text>}
          </Pressable>
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Chưa nhận được email?</Text>
            <Pressable disabled={cooldown > 0 || resending} onPress={() => { void resend(); }}>
              <Text style={[styles.resendButton, (cooldown > 0 || resending) && styles.resendDisabled]}>
                {resending ? "Đang gửi..." : cooldown > 0 ? `Gửi lại sau ${cooldown} giây` : "Gửi lại mã"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  container: { flex: 1, justifyContent: "center", padding: 24 },
  backButton: { alignSelf: "flex-start", marginBottom: 28 },
  backText: { color: "#2F6B5F", fontSize: 14, fontWeight: "700" },
  eyebrow: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.4, marginBottom: 10 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#68736F", fontSize: 16, lineHeight: 24, marginBottom: 30 },
  email: { color: "#17211F", fontWeight: "700" },
  codeInput: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 12, borderWidth: 1, color: "#17211F", fontSize: 26, fontWeight: "700", letterSpacing: 14, marginBottom: 12, padding: 18, textAlign: "center" },
  error: { color: "#B42318", fontSize: 13, marginVertical: 8 },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", minHeight: 54, marginTop: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  resendRow: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 24 },
  resendLabel: { color: "#68736F", fontSize: 14, marginRight: 6 },
  resendButton: { color: "#2F6B5F", fontSize: 14, fontWeight: "700" },
  resendDisabled: { color: "#8B949E" },
});
