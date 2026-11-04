import { Platform } from "react-native";
import type { GatewayClient } from "./gatewayApi";

export type RegistrationResult =
  | { status: "registered"; token: string }
  | { status: "skipped"; reason: "unsupported-platform" | "no-project-id" | "permission-denied" | "module-unavailable" }
  | { status: "failed"; reason: string };

/**
 * Registers this device's Expo push token with notification-service on app start.
 * Never throws: push is optional, so every failure is reported as a result instead.
 * - expo-notifications is loaded lazily, so the app still runs where the native module is missing.
 * - Expo requires an EAS projectId for push tokens: EXPO_PUBLIC_EAS_PROJECT_ID (not a secret).
 */
export async function registerDeviceToken(api: GatewayClient): Promise<RegistrationResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return { status: "skipped", reason: "unsupported-platform" };
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (!projectId) return { status: "skipped", reason: "no-project-id" };

  let Notifications: typeof import("expo-notifications");
  try {
    Notifications = await import("expo-notifications");
  } catch {
    return { status: "skipped", reason: "module-unavailable" };
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { status: "skipped", reason: "permission-denied" };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post("/api/notifications/device-tokens", {
      token,
      platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
    });
    return { status: "registered", token };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "unknown" };
  }
}
