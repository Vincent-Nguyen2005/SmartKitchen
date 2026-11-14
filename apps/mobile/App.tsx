import React, { useEffect, useState } from "react";
import {
  Archive,
  Bell,
  BookOpen,
  LogOut,
  Salad,
  Settings,
  ShoppingBasket,
  Utensils,
  Users,
} from "lucide-react-native";
import { AppIcon, breakpoints, colors, spacing, textStyles, touchTarget } from "./src/theme";
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import LoginScreen from "./src/screens/auth/LoginScreen";
import ForgotPasswordScreen from "./src/screens/auth/ForgotPasswordScreen";
import OtpVerificationScreen from "./src/screens/auth/OtpVerificationScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import FamilyScreenFlow from "./src/screens/family/FamilyScreenFlow";
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";
import { SessionProvider, useSession } from "./src/services/session";
import NotificationsHome from "./src/screens/notifications/NotificationsHome";
import AdminHome from "./src/screens/admin/AdminHome";
import MenuScreen from "./src/screens/menu/MenuScreen";
import RecipeScreen from "./src/screens/recipes/RecipeScreen";
import PaymentScreen, { type PaymentResult } from "./src/screens/payment/PaymentScreen";
import { createGatewayClient } from "./src/screens/notifications/gatewayApi";
import { registerDeviceToken } from "./src/screens/notifications/registerDeviceToken";

type Tab =
  | "inventory"
  | "shopping"
  | "menu"
  | "recipes"
  | "nutrition"
  | "family"
  | "notifications"
  | "admin";
type AuthView = "login" | "register" | "otp" | "forgot";
const tabs = [
  { key: "inventory", label: "Kho", icon: Archive },
  { key: "shopping", label: "Đi chợ", icon: ShoppingBasket },
  { key: "menu", label: "Thực đơn", icon: Utensils },
  { key: "recipes", label: "Công thức", icon: BookOpen },
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
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("inventory");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [otpInitialCooldown, setOtpInitialCooldown] = useState(60);
  const sessionUserId = session.user?.id;
  const userId = resolveNutritionUserId(sessionUserId);
  const isAdmin = session.user?.role === "ADMIN";
  // SCRUM-283: ADMIN accounts see only the admin tab; everyone else sees every tab except admin.
  const visibleTabs = tabs.filter(({ key }) => (key === "admin") === isAdmin);
  // Derived (not synced in an effect) so no other tab renders for a frame after the role changes.
  const activeTab: Tab = isAdmin ? "admin" : tab === "admin" ? "inventory" : tab;
  const tabWidth = width >= breakpoints.wide
    ? Math.min(140, width / visibleTabs.length)
    : width < 360 ? 72 : 88;

  // Register this device's Expo push token once per signed-in user; fails silently (Huy, #61).
  useEffect(() => {
    if (!session.user || !session.accessToken) return;
    void registerDeviceToken(createGatewayClient(session.accessToken));
  }, [session.user?.id, session.accessToken]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!session.ready) {
    return (
      <SafeAreaView style={styles.loading as any}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (session.restoreError) {
    return (
      <SafeAreaView style={styles.restoreError}>
        <Text style={styles.noticeTitle}>
          Không thể khôi phục phiên đăng nhập
        </Text>
        <Text style={styles.noticeMessage}>
          Vui lòng kiểm tra kết nối mạng và thử lại. Bạn không cần đăng nhập
          lại.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={session.retryRestore}
          style={styles.retryButton}
        >
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
          notice={notice}
          initialCooldownSeconds={otpInitialCooldown}
          onVerify={async (code) => {
            await session.verifyOtp(code);
            setNotice("Xác minh thành công. Bạn đã đăng nhập.");
          }}
          onResend={async () => {
            await session.resendOtp();
            setNotice("Đã gửi mã mới.");
          }}
          onBack={() => { setNotice(null); setAuthView("register"); }}
        />
      );
    }
    if (authView === "forgot") {
      return <ForgotPasswordScreen onBack={() => setAuthView("login")} onSuccess={() => {
        setNotice("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.");
        setAuthView("login");
      }} />;
    }
    if (authView === "register") {
      return (
        <RegisterScreen
          navigation={{ navigate: () => setAuthView("login") }}
          onSubmit={async (fullName, email, password) => {
            const result = await session.register(fullName, email, password);
            setOtpInitialCooldown(result.retryAfterSeconds);
            setNotice(result.otpSent ? null : "Mã cũ vẫn dùng được. Chờ để gửi mã mới.");
            setAuthView("otp");
          }}
        />
      );
    }
    return (
      <LoginScreen
        navigation={{
          navigate: () => { setNotice(null); setAuthView("register"); },
        }}
        notice={notice}
        onSubmit={async (email, password) => {
          await session.signIn(email, password);
          setNotice("Đăng nhập thành công.");
        }}
        onForgotPassword={() => { setNotice(null); setAuthView("forgot"); }}
        onVerificationRequired={() => {
          setOtpInitialCooldown(0);
          setNotice("Chưa xác minh email. Gửi lại mã nếu cần.");
          setAuthView("otp");
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>SmartKitchen</Text>
        <TouchableOpacity
          accessibilityLabel="Đăng xuất"
          accessibilityRole="button"
          onPress={() => {
            void session.signOut();
          }}
          style={styles.signOutButton}
        >
          <AppIcon icon={LogOut} size="sm" color={colors.surface} />
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {!!notice && <Text accessibilityRole="alert" style={styles.authNotice}>{notice}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={[styles.tabBarContent, width >= breakpoints.wide && styles.tabBarContentWide]}>
        {visibleTabs.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={key}
                style={[styles.tab, { width: tabWidth }, active && styles.tabActive]}
                onPress={() => setTab(key)}
              >
                <AppIcon
                  icon={Icon}
                  size="md"
                  color={active ? colors.primary : colors.muted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {/* Nội dung hiển thị theo Tab */}
      <View style={styles.content}>
        {paymentUrl ? (
          <PaymentScreen
            url={paymentUrl}
            onClose={() => setPaymentUrl(null)}
            onComplete={(_result: PaymentResult) => {
              setPaymentUrl(null);
              setTab("inventory");
            }}
          />
        ) : null}
        {!paymentUrl && activeTab === "inventory" && (
          <InventoryScreen onOpenFamily={() => setTab("family")} />
        )}
        {!paymentUrl && activeTab === "recipes" && (
          <RecipeScreen accessToken={session.accessToken} />
        )}
        {!paymentUrl && activeTab === "shopping" && <ShoppingCartScreen />}
        {!paymentUrl && activeTab === "menu" && (
          <MenuScreen
            accessToken={session.accessToken}
            familyId={session.family?.id}
            onPaymentStarted={setPaymentUrl}
          />
        )}
        {!paymentUrl && activeTab === "family" && <FamilyScreenFlow />}
        {!paymentUrl && activeTab === "notifications" && <NotificationsHome />}
        {!paymentUrl && activeTab === "admin" && isAdmin && <AdminHome />}
        {!paymentUrl && activeTab === "nutrition" && (
          <NutritionProfileScreen
            apiBaseUrl={apiBaseUrl}
            accessToken={session.accessToken ?? undefined}
          />
        )}
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
  authNotice: { backgroundColor: "#E8F4EE", color: "#20594F", padding: 12, textAlign: "center" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: "center",
    backgroundColor: colors.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  headerText: { ...textStyles.subheading, color: colors.surface },
  signOutButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
  },
  signOutText: { ...textStyles.labelSmall, color: colors.surface },
  tabBar: {
    borderBottomWidth: 1 as number,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  tabBarContent: {
    flexDirection: "row",
  },
  tabBarContentWide: {
    alignSelf: "center",
    width: "100%",
  },
  tab: {
    alignItems: "center",
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
  tabText: {
    ...textStyles.labelSmall,
    color: colors.muted,
    textAlign: "center",
  },
  tabTextActive: { color: colors.primary },
  content: { flex: 1 },
  restoreError: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: spacing.lg,
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
  },
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
