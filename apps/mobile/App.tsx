import React, { useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MealDiaryScreen from "./src/screens/meal-diary/MealDiaryScreen";
import NutritionProfileScreen from "./src/screens/nutrition/NutritionProfileScreen";

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

export default function App(): React.JSX.Element {
  const sessionUserId: string | undefined = undefined;
  const userId = resolveNutritionUserId(sessionUserId);
  const [activeTab, setActiveTab] = useState<"diary" | "profile">("diary");

  return (
    <SafeAreaProvider>
      {!userId ? (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.notice}>
            <Text style={styles.title}>Thiếu thông tin người dùng</Text>
            <Text style={styles.message}>
              Không tìm thấy user ID trong phiên đăng nhập hoặc cấu hình Expo.
              Hãy đăng nhập hoặc đặt EXPO_PUBLIC_USER_ID trong file .env để chạy
              thử cục bộ.
            </Text>
          </View>
        </SafeAreaView>
      ) : (
        <View style={styles.app}>
          <SafeAreaView edges={["top"]} style={styles.navigation}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "diary" }}
              onPress={() => setActiveTab("diary")}
              style={[styles.tab, activeTab === "diary" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "diary" && styles.activeTabText,
                ]}
              >
                Nhật ký
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "profile" }}
              onPress={() => setActiveTab("profile")}
              style={[styles.tab, activeTab === "profile" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "profile" && styles.activeTabText,
                ]}
              >
                Hồ sơ
              </Text>
            </Pressable>
          </SafeAreaView>
          <View style={styles.screen}>
            {activeTab === "diary" ? (
              <MealDiaryScreen apiBaseUrl={apiBaseUrl} userId={userId} />
            ) : (
              <NutritionProfileScreen apiBaseUrl={apiBaseUrl} userId={userId} />
            )}
          </View>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { backgroundColor: "#F4F7F2", flex: 1 },
  navigation: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#DCE5DD",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  tab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 3,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  activeTab: { borderBottomColor: "#28735D" },
  tabText: { color: "#77847D", fontSize: 14, fontWeight: "700" },
  activeTabText: { color: "#183D32" },
  screen: { flex: 1 },
  safeArea: { backgroundColor: "#F4F7F2", flex: 1, justifyContent: "center" },
  notice: { padding: 24 },
  title: { color: "#182A24", fontSize: 22, fontWeight: "700" },
  message: { color: "#65746C", fontSize: 15, lineHeight: 22, marginTop: 10 },
});
