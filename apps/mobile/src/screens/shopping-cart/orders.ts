/**
 * Đi chợ delivery orders: pure helpers (no React Native), covered by orders.test.ts.
 * Status chips, phone check, Vietnamese address from reverse geocoding, times in Vietnam, and the Leaflet page used by
 * the map picker (OpenStreetMap tiles in a WebView, no API key).
 */
import type { OrderStatus } from "./shoppingApi";

export type StatusTone = "warning" | "primary" | "success" | "muted" | "danger";
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: "Đã đặt", tone: "warning" },
  SHIPPING: { label: "Đang giao", tone: "primary" },
  DELIVERED: { label: "Đã giao", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "muted" },
  FAILED: { label: "Không giao được", tone: "danger" },
};

/** Only an order still waiting for a shipper can be cancelled by the family. */
export const canCancel = (status: OrderStatus): boolean => status === "PENDING";

/** Same rule as the server: 0xxxxxxxxx or +84xxxxxxxxx (spaces, dots, dashes ignored). */
export const normalizePhone = (value: string): string => value.replace(/[\s.-]/g, "");
export const isValidVnPhone = (value: string): boolean => /^(?:\+84|84|0)(?:3|5|7|8|9|2\d)\d{8}$/.test(normalizePhone(value));

/** What the checkout form needs before "Đặt hàng"; null when everything is fine. */
export const deliveryProblem = (input: { address: string; receiverName: string; receiverPhone: string }): string | null => {
  if (input.address.trim().length < 5) return "Nhập địa chỉ giao hàng";
  if (!input.receiverName.trim()) return "Nhập tên người nhận";
  if (!isValidVnPhone(input.receiverPhone)) return "Số điện thoại không hợp lệ";
  return null;
};

/** expo-location's reverseGeocodeAsync result (the fields used here). */
export type GeocodedAddress = {
  name?: string | null; streetNumber?: string | null; street?: string | null; district?: string | null;
  subregion?: string | null; city?: string | null; region?: string | null; formattedAddress?: string | null;
};
/**
 * "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh": the device's own formatted address when it has one (Android), else the
 * parts joined without repeats.
 */
export const addressText = (place: GeocodedAddress | null | undefined): string => {
  if (!place) return "";
  if (place.formattedAddress?.trim()) return place.formattedAddress.trim().replace(/,\s*(Việt Nam|Vietnam)$/i, "");
  const street = [place.streetNumber, place.street].filter(Boolean).join(" ").trim();
  const parts = [street || place.name, place.district, place.subregion, place.city, place.region]
    .map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return parts.filter((part, index) => parts.indexOf(part) === index).join(", ");
};

const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (value: number): string => String(value).padStart(2, "0");
/** "26/11 · 18:05" (Vietnam time). */
export const orderTime = (iso: string): string => {
  const shifted = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)} · ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
};

/** Hồ Chí Minh City centre: the map's start when there is no location yet. */
export const DEFAULT_CENTER = { latitude: 10.7769, longitude: 106.7009 };

/**
 * The map picker's page: Leaflet + OpenStreetMap tiles, a draggable pin; tapping the map moves the pin. It posts
 * {"latitude","longitude"} to the app after every move (phones: window.ReactNativeWebView; web: the parent window of
 * the iframe) and accepts the same JSON to move the pin ("Dùng vị trí hiện tại"). Coordinates are numbers only (no
 * text is injected).
 */
export const mapPickerHtml = (center: { latitude: number; longitude: number }): string => {
  const lat = Number(center.latitude).toFixed(6);
  const lng = Number(center.longitude).toFixed(6);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div><script>
var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
var pin = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
function post(text) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text); else if (window.parent && window.parent !== window) window.parent.postMessage(text, '*'); }
function send() { var p = pin.getLatLng(); post(JSON.stringify({ latitude: p.lat, longitude: p.lng })); }
pin.on('dragend', send);
map.on('click', function (e) { pin.setLatLng(e.latlng); send(); });
function moveTo(lat, lng) { pin.setLatLng([lat, lng]); map.setView([lat, lng], 17); send(); }
document.addEventListener('message', function (e) { try { var d = JSON.parse(e.data); moveTo(d.latitude, d.longitude); } catch (x) {} });
window.addEventListener('message', function (e) { try { var d = JSON.parse(e.data); moveTo(d.latitude, d.longitude); } catch (x) {} });
</script></body></html>`;
};

/** Parses a message from the map page; null for anything that is not a coordinate pair. */
export const parsePinMessage = (data: string): { latitude: number; longitude: number } | null => {
  try {
    const value = JSON.parse(data) as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
  } catch {
    return null;
  }
};

/**
 * Web: a message event from the picker iframe → the pin, only when it comes from that iframe (event.source) and is a
 * coordinate pair; anything else (other frames, extensions, bad data) is ignored.
 */
export const pinFromFrameEvent = (event: { source: unknown; data: unknown }, frameWindow: unknown): { latitude: number; longitude: number } | null =>
  frameWindow && event.source === frameWindow && typeof event.data === "string" ? parsePinMessage(event.data) : null;

/**
 * Web reverse geocoding (expo-location's reverseGeocodeAsync is not available in browsers): OpenStreetMap Nominatim,
 * Vietnamese names. Called only after the pin stops moving (at most about once a second, per Nominatim's policy).
 */
export const nominatimUrl = (point: { latitude: number; longitude: number }): string =>
  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.latitude.toFixed(6)}&lon=${point.longitude.toFixed(6)}&accept-language=vi&zoom=18&addressdetails=1`;

/** Nominatim answer → "12 Lê Lợi, Bến Nghé, Quận 1, Hồ Chí Minh" (house number + road, ward, district, city). */
export const addressFromNominatim = (body: unknown): string => {
  const value = body as { address?: Record<string, unknown>; display_name?: unknown } | null;
  const address = value?.address ?? {};
  const text = (key: string) => (typeof address[key] === "string" ? (address[key] as string).trim() : "");
  const street = [text("house_number"), text("road")].filter(Boolean).join(" ");
  const parts = [street || text("amenity") || text("building"), text("quarter") || text("suburb") || text("neighbourhood"), text("city_district") || text("county"), text("city") || text("town") || text("state")]
    .filter(Boolean);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  if (unique.length > 0) return unique.join(", ");
  return typeof value?.display_name === "string" ? value.display_name.replace(/,\s*(Việt Nam|Vietnam)$/i, "").trim() : "";
};
