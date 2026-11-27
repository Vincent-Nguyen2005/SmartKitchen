import { Platform } from "react-native";
import { addressFromNominatim, addressText, nominatimUrl } from "./orders";

type Point = { latitude: number; longitude: number };

/**
 * Coordinates → a Vietnamese address string ("" when unknown).
 * - Phones: the device's own geocoder (expo-location reverseGeocodeAsync), as before.
 * - Web: expo-location cannot reverse geocode in a browser, so OpenStreetMap Nominatim (sends the coordinates to
 *   nominatim.openstreetmap.org; callers ask only after the pin stops moving).
 */
export async function reverseGeocode(point: Point): Promise<string> {
  try {
    if (Platform.OS === "web") {
      const response = await fetch(nominatimUrl(point), { headers: { Accept: "application/json" } });
      return response.ok ? addressFromNominatim(await response.json()) : "";
    }
    const Location = await import("expo-location");
    const [place] = await Location.reverseGeocodeAsync(point);
    return addressText(place);
  } catch {
    return "";
  }
}
