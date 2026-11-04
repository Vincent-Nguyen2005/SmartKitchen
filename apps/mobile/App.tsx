import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";

type Tab = "inventory" | "shopping" | "nutrition";

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

export default function App() {
  const [tab, setTab] = useState<Tab>("inventory");
  const sessionUserId: string | undefined = undefined; // Tạm thời để undefined như Hùng
  const userId = resolveNutritionUserId(sessionUserId);

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
