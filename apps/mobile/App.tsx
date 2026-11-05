import React, { useEffect, useState } from "react";
import { Archive, Bell, LogOut, Salad, Settings, ShoppingBasket, Users } from "lucide-react-native";
import { AppIcon, colors, spacing, textStyles, touchTarget } from "./src/theme";
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import LoginScreen from "./src/screens/auth/LoginScreen";
import OtpVerificationScreen from "./src/screens/auth/OtpVerificationScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import FamilyScreenFlow from "./src/screens/family/FamilyScreenFlow";
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";
import { SessionProvider, useSession } from "./src/services/session";
import NotificationsHome from "./src/screens/notifications/NotificationsHome";
import AdminHome from "./src/screens/admin/AdminHome";
import { createGatewayClient } from "./src/screens/notifications/gatewayApi";
import { registerDeviceToken } from "./src/screens/notifications/registerDeviceToken";

type Tab = "inventory" | "shopping" | "nutrition" | "family" | "notifications" | "admin";
type AuthView = "login" | "register" | "otp";
const tabs = [
  { key: "inventory", label: "Kho", icon: Archive },
  { key: "shopping", label: "Đi chợ", icon: ShoppingBasket },
  { key: "family", label: "Gia đình", icon: Users },
  { key: "nutrition", label: "Dinh dưỡng", icon: Salad },
  { key: "notifications", label: "Thông báo", icon: Bell },
  { key: "admin", label: "Quản trị", icon: Settings },
] as const;

// Logic lấy API và User ID của Hùng
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "android"
    ? "http://10.0.2.2:4000"
    : "http://localhost:4000");

export function resolveNutritionUserId(
  sessionUserId?: string | null,
): string | undefined {
  const userId =
    sessionUserId?.trim() || process.env.EXPO_PUBLIC_USER_ID?.trim();
  return userId || undefined;
}

function AppContent(): React.JSX.Element {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("inventory");
  const [authView, setAuthView] = useState<AuthView>("login");
  const sessionUserId = session.user?.id;
  const userId = resolveNutritionUserId(sessionUserId);
  const isAdmin = session.user?.role === "ADMIN";

  // Register this device's Expo push token once per signed-in user; fails silently (Huy, #61).
  useEffect(() => {
    if (!session.user || !session.accessToken) return;
    void registerDeviceToken(createGatewayClient(session.accessToken));
  }, [session.user?.id, session.accessToken]);

  // Leave the admin tab if the signed-in user is not an admin (e.g. after switching accounts).
  useEffect(() => {
    if (tab === "admin" && !isAdmin) setTab("inventory");
  }, [isAdmin, tab]);

  if (!session.ready) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (session.restoreError) {
    return (
      <SafeAreaView style={styles.restoreError}>
        <Text style={styles.noticeTitle}>Không thể khôi phục phiên đăng nhập</Text>
        <Text style={styles.noticeMessage}>
          Vui lòng kiểm tra kết nối mạng và thử lại. Bạn không cần đăng nhập lại.
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={session.retryRestore} style={styles.retryButton}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!session.user) {
    if (authView === "otp" && session.pendingVerificationEmail) {
      return (
        <OtpVerificationScreen
          email={session.pendingVerificationEmail}
          onVerify={session.verifyOtp}
          onResend={session.resendOtp}
          onBack={() => setAuthView("register")}
        />
      );
    }
    if (authView === "register") {
      return (
        <RegisterScreen
          navigation={{ navigate: () => setAuthView("login") }}
          onSubmit={async (fullName, email, password) => {
            await session.register(fullName, email, password);
            setAuthView("otp");
          }}
        />
      );
    }
    return (
      <LoginScreen
        navigation={{
          navigate: () => setAuthView("register"),
        }}
        onSubmit={session.signIn}
        onVerificationRequired={() => setAuthView("otp")}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>SmartKitchen</Text>
        <TouchableOpacity accessibilityLabel="Đăng xuất" accessibilityRole="button" onPress={() => { void session.signOut(); }} style={styles.signOutButton}>
          <AppIcon icon={LogOut} size="sm" color={colors.surface} />
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {tabs.filter(({ key }) => key !== "admin" || isAdmin).map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              accessibilityLabel={label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <AppIcon icon={Icon} size="md" color={active ? colors.primary : colors.muted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Nội dung hiển thị theo Tab */}
      <View style={styles.content}>
        {tab === "inventory" && <InventoryScreen onOpenFamily={() => setTab("family")} />}
        {tab === "shopping" && <ShoppingCartScreen />}
        {tab === "family" && <FamilyScreenFlow />}
        {tab === "notifications" && <NotificationsHome />}
        {tab === "admin" && isAdmin && <AdminHome />}
        {tab === "nutrition" &&
          (userId ? (
            <NutritionProfileScreen apiBaseUrl={apiBaseUrl} userId={userId} />
          ) : (
            <View style={styles.center}>
              <Text style={styles.noticeTitle}>
                Thiếu thông tin người dùng
              </Text>
              <Text style={styles.noticeMessage}>
                Không tìm thấy user ID. Hãy đặt EXPO_PUBLIC_USER_ID trong file
                .env để chạy thử cục bộ.
              </Text>
            </View>
          ))}
      </View>
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: "center", backgroundColor: colors.primary, flexDirection: "row", justifyContent: "space-between", padding: spacing.md },
  headerText: { ...textStyles.subheading, color: colors.surface },
  signOutButton: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.sm },
  signOutText: { ...textStyles.labelSmall, color: colors.surface },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: touchTarget + spacing.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.surface,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  tabText: { ...textStyles.labelSmall, color: colors.muted, textAlign: "center" },
  tabTextActive: { color: colors.primary },
  content: { flex: 1 },
  restoreError: { backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: spacing.xl },
  retryButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", marginTop: spacing.lg, minHeight: touchTarget, paddingHorizontal: spacing.xl },
  retryText: { ...textStyles.label, color: colors.surface },

  // Styles cho phần thông báo thiếu user của Hùng
  center: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  noticeTitle: { ...textStyles.heading, color: colors.text },
  noticeMessage: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.sm,
  },
});
