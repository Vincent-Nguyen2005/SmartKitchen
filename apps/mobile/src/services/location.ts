import { Platform } from "react-native";
import { locationStatus, shouldRequestPermission, type LocationStatus } from "./locationState";

export type Point = { latitude: number; longitude: number };

/**
 * One device position, calmly (see locationState.ts): checks that device location is on first (no request, no system
 * dialog when it is off), then the permission, then one Balanced position with mayShowUserSettingsDialog false (no
 * Android "improve location accuracy" prompt). No tracking.
 */
export async function positionOnce(): Promise<{ status: LocationStatus; point: Point | null }> {
  try {
    const Location = await import("expo-location");
    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!shouldRequestPermission(servicesEnabled)) return { status: "services-off", point: null };
    const permission = await Location.requestForegroundPermissionsAsync();
    const status = locationStatus({ servicesEnabled, permissionGranted: permission.granted });
    if (status !== "granted") return { status, point: null };
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
    return { status, point: { latitude: position.coords.latitude, longitude: position.coords.longitude } };
  } catch {
    // Location unavailable right now (e.g. no fix): treated like "off", the screen keeps working without it.
    return { status: "services-off", point: null };
  }
}

/**
 * Only from our banner's button: asks the system once to turn device location on (Android
 * enableNetworkProviderAsync). Elsewhere there is no such prompt (the user turns it on in Settings). true when on.
 */
export async function askToEnableLocation(): Promise<boolean> {
  try {
    const Location = await import("expo-location");
    if (Platform.OS === "android") await Location.enableNetworkProviderAsync();
    return await Location.hasServicesEnabledAsync();
  } catch {
    // Declined: the map still works without the user's position.
    return false;
  }
}
