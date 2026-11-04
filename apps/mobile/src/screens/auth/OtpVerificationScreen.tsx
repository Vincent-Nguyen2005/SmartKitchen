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
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onVerify(otpCode);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Unable to verify your account.");
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
      setError(resendError instanceof Error ? resendError.message : "Unable to resend the code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <View>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Change email address</Text>
          </Pressable>
          <Text style={styles.eyebrow}>EMAIL VERIFICATION</Text>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit verification code to{"\n"}
            <Text style={styles.email}>{email}</Text>
          </Text>
          <TextInput
            accessibilityLabel="Six-digit email verification code"
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
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Verify account</Text>}
          </Pressable>
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the email?</Text>
            <Pressable disabled={cooldown > 0 || resending} onPress={() => { void resend(); }}>
              <Text style={[styles.resendButton, (cooldown > 0 || resending) && styles.resendDisabled]}>
                {resending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
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
