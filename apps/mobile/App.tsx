import React, { useState } from "react";
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
import {
  Apple,
  LogOut,
  ShoppingCart,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react-native";

type Tab = "inventory" | "shopping" | "nutrition" | "family";
type AuthView = "login" | "register" | "otp";
const tabs: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: "inventory", label: "Kho", icon: Apple },
  { key: "shopping", label: "Đi chợ", icon: ShoppingCart },
  { key: "family", label: "Gia đình", icon: Users },
  { key: "nutrition", label: "Dinh dưỡng", icon: Utensils },
];

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

  if (!session.ready) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#2F6B5F" size="large" />
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
            <LogOut color="#FFFFFF" size={18} strokeWidth={2.2} />
            <Text style={styles.signOutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          {tabs.map(({ key, label, icon: Icon }) => {
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
                <Icon color={active ? "#2F6B5F" : "#888888"} size={20} strokeWidth={active ? 2.4 : 2} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Nội dung hiển thị theo Tab */}
        <View style={styles.content}>
          {tab === "inventory" && <InventoryScreen />}
          {tab === "shopping" && <ShoppingCartScreen />}
          {tab === "family" && <FamilyScreenFlow />}
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
  return <SafeAreaProvider><SessionProvider><AppContent /></SessionProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#fff" },
  header: { padding: 12, backgroundColor: "#2F6B5F", alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headerText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  signOutButton: { alignItems: "center", flexDirection: "row", gap: 6, padding: 8 },
  signOutText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: "#fafafa",
  },
  tabActive: {
    backgroundColor: "#fff",
    borderBottomWidth: 3,
    borderBottomColor: "#2F6B5F",
  },
  tabText: { fontSize: 14, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#2F6B5F" },
  content: { flex: 1 },

  // Styles cho phần thông báo thiếu user của Hùng
  center: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F4F7F2",
  },
  noticeTitle: { color: "#182A24", fontSize: 22, fontWeight: "700" },
  noticeMessage: {
    color: "#65746C",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
});
