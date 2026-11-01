import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Platform, StyleSheet, Text, View } from "react-native";
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
        <NutritionProfileScreen apiBaseUrl={apiBaseUrl} userId={userId} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F4F7F2", flex: 1, justifyContent: "center" },
  notice: { padding: 24 },
  title: { color: "#182A24", fontSize: 22, fontWeight: "700" },
  message: { color: "#65746C", fontSize: 15, lineHeight: 22, marginTop: 10 },
});
