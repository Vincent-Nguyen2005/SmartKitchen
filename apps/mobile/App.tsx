import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";
import { SessionProvider, useSession } from "./src/services/session";

type Tab = "inventory" | "shopping" | "nutrition";
type AuthView = "login" | "register" | "otp";

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
  const sessionUserId: string | undefined = undefined; // Tạm thời để undefined như Hùng
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
          navigate: (screen) => {
            if (screen === "Register") setAuthView("register");
            else Alert.alert("Password reset", "Password reset is not available in this test build.");
          },
        }}
        onSubmit={session.signIn}
      />
    );
  }

  return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>SmartKitchen</Text>
        </View>

        {/* Thanh Điều hướng 3 Tab */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === "inventory" && styles.tabActive]}
            onPress={() => setTab("inventory")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "inventory" && styles.tabTextActive,
              ]}
            >
              📦 Kho
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "shopping" && styles.tabActive]}
            onPress={() => setTab("shopping")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "shopping" && styles.tabTextActive,
              ]}
            >
              🛒 Đi chợ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "nutrition" && styles.tabActive]}
            onPress={() => setTab("nutrition")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "nutrition" && styles.tabTextActive,
              ]}
            >
              🥗 Dinh dưỡng
            </Text>
          </TouchableOpacity>
        </View>

        {/* Nội dung hiển thị theo Tab */}
        <View style={styles.content}>
          {tab === "inventory" && <InventoryScreen />}
          {tab === "shopping" && <ShoppingCartScreen />}
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
  header: { padding: 12, backgroundColor: "#007AFF", alignItems: "center" },
  headerText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  tabActive: {
    backgroundColor: "#fff",
    borderBottomWidth: 3,
    borderBottomColor: "#007AFF",
  },
  tabText: { fontSize: 14, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#007AFF" },
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
