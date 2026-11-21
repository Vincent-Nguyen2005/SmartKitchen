import React, { useState } from "react";
import { ArrowLeft } from "lucide-react-native";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppIcon, colors, typography } from "../../theme";

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
    if (mode === "create" && value.length < 2) return setError("Tên gia đình cần ít nhất 2 ký tự.");
    if (mode === "join" && value.length < 6) return setError("Vui lòng nhập mã mời hợp lệ.");
    setError("");
    setLoading(true);
    try {
      if (mode === "create") await onCreate?.(value);
      else await onJoin?.(value);
    } catch {
      setError(mode === "create" ? "Không thể tạo gia đình. Vui lòng thử lại." : "Không thể dùng mã mời. Kiểm tra lại hoặc thử sau.");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          {!!onBack && <Pressable accessibilityRole="button" accessibilityLabel="Quay lại gia đình" onPress={onBack} style={styles.backButton}><AppIcon icon={ArrowLeft} color={colors.primary} /><Text style={styles.link}>Quay lại</Text></Pressable>}
          <Text style={styles.title}>{mode === "create" ? "Tạo gia đình" : "Tham gia gia đình"}</Text>
          <Text style={styles.subtitle}>{mode === "create" ? "Cùng người thân quản lý bữa ăn và mua sắm." : "Nhập mã mời để tham gia cùng gia đình."}</Text>
          <View style={styles.tabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "create" }} onPress={() => { setMode("create"); setError(""); }} style={[styles.tab, mode === "create" && styles.activeTab]}><Text style={[styles.tabText, mode === "create" && styles.activeTabText]}>Tạo mới</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "join" }} onPress={() => { setMode("join"); setError(""); }} style={[styles.tab, mode === "join" && styles.activeTab]}><Text style={[styles.tabText, mode === "join" && styles.activeTabText]}>Tham gia</Text></Pressable>
          </View>
          <View style={styles.formCard}>
            {mode === "create" ? <>
              <Text style={styles.label}>Tên gia đình</Text>
              <TextInput accessibilityLabel="Tên gia đình" autoCapitalize="words" maxLength={80} onChangeText={setName} placeholder="Ví dụ: Bếp nhà mình" placeholderTextColor="#8B949E" style={styles.input} value={name} />
              <Text style={styles.helper}>Bạn sẽ là chủ gia đình.</Text>
            </> : <>
              <Text style={styles.label}>Mã mời gia đình</Text>
              <TextInput accessibilityLabel="Mã mời gia đình" autoCapitalize="none" autoCorrect={false} onChangeText={setInviteCode} placeholder="Nhập mã mời" placeholderTextColor="#8B949E" style={styles.input} value={inviteCode} />
              <Text style={styles.helper}>Xin mã từ chủ gia đình.</Text>
            </>}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{mode === "create" ? "Tạo gia đình" : "Tham gia gia đình"}</Text>}
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  container: { flex: 1 },
  content: { alignSelf: "center", flexGrow: 1, maxWidth: 560, padding: 24, width: "100%" },
  backButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 8, marginBottom: 20, minHeight: 44 },
  link: { color: "#2F6B5F", fontSize: typography.body.fontSize, fontWeight: "700" },
  title: { ...typography.pageTitle, color: colors.text },
  subtitle: { color: "#68736F", fontSize: typography.body.fontSize, lineHeight: 23, marginTop: 8 },
  tabs: { backgroundColor: "#E9EDE9", borderRadius: 12, flexDirection: "row", marginTop: 24, padding: 4 },
  tab: { alignItems: "center", borderRadius: 9, flex: 1, justifyContent: "center", minHeight: 44 },
  activeTab: { backgroundColor: "#FFFFFF", shadowColor: "#17211F", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  tabText: { color: "#68736F", fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
  activeTabText: { color: "#2F6B5F" },
  formCard: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 20 },
  label: { color: "#17211F", fontSize: typography.body.fontSize, fontWeight: "700", marginBottom: 11 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#DCE3DE", borderRadius: 11, borderWidth: 1, color: "#17211F", fontSize: typography.body.fontSize, padding: 15 },
  helper: { color: "#7A8580", fontSize: typography.bodySmall.fontSize, lineHeight: 19, marginTop: 9 },
  error: { color: "#B42318", fontSize: typography.bodySmall.fontSize, marginTop: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, justifyContent: "center", marginTop: 22, minHeight: 52 },
  primaryButtonText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});
