/**
 * Shipper app: API types and pure helpers (no React Native), covered by shipper.test.ts.
 */
import { formatVnd } from "../../services/format";
import { amountText } from "../shopping-cart/unitDisplay";

export type ShipperScope = "available" | "mine" | "history";
export type ShipperOrderLine = { name: string; quantity: number; unit: string; unitLabel: string | null; unitPrice: number | null; originalUnitPrice: number | null; lineTotal: number | null };
export type ShipperOrder = {
  id: string;
  status: "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "FAILED";
  orderedAt: string;
  shippingAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failReason: string | null;
  deliveryAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  receiverName: string | null;
  receiverPhone: string | null;
  note: string | null;
  paymentMethod: "COD";
  codAmount: number;
  itemCount: number;
  items: ShipperOrderLine[];
};

export const SHIPPER_TABS: Array<{ value: ShipperScope; label: string }> = [
  { value: "available", label: "Đơn chờ" },
  { value: "mine", label: "Đang giao" },
  { value: "history", label: "Lịch sử" },
];

/** "Không giao được" reasons; "Khác" needs a typed reason. */
export const FAIL_REASONS = ["Không liên lạc được", "Sai địa chỉ", "Khách từ chối nhận", "Khác"] as const;
export type FailReason = (typeof FAIL_REASONS)[number];
/** The reason sent to the server; null while "Khác" has no text. */
export const failReasonText = (reason: FailReason | null, other: string): string | null => {
  if (!reason) return null;
  if (reason !== "Khác") return reason;
  const text = other.trim();
  return text ? text.slice(0, 300) : null;
};

/** "Thu 675.000đ". */
export const codText = (amount: number): string => `Thu ${formatVnd(amount)}`;
/** "Xác nhận đã giao và thu 675.000đ?" */
export const deliverConfirmTitle = (amount: number): string => `Xác nhận đã giao và thu ${formatVnd(amount)}?`;
/** "850 m", "2,4 km"; null without a distance. */
export const distanceText = (km: number | null): string | null => {
  if (km === null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${(Math.round(km * 10) / 10).toString().replace(".", ",")} km`;
};
/** The first part of the address for cards ("12 Lê Lợi, Bến Nghé"): at most two comma parts. */
export const shortAddress = (address: string | null): string => {
  if (!address?.trim()) return "Chưa có địa chỉ";
  return address.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(", ");
};
/** "3 món". */
export const itemCountText = (count: number): string => `${count} món`;
/** "1,5 kg", "2 gói", "3 quả". */
export const lineQuantity = (line: Pick<ShipperOrderLine, "quantity" | "unit" | "unitLabel">): string => amountText(line.quantity, line.unit, line.unitLabel);

const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (value: number): string => String(value).padStart(2, "0");
/** "18:05" today, else "26/11 · 18:05" (Vietnam time). */
export const placedText = (iso: string, now: Date = new Date()): string => {
  const at = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const today = new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
  const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
  return at.toISOString().slice(0, 10) === today ? time : `${pad(at.getUTCDate())}/${pad(at.getUTCMonth() + 1)} · ${time}`;
};

/** tel: link with the digits only. */
export const telUrl = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, "")}`;

/**
 * Links that open the device's map app with directions, in order of preference: the native scheme (Android geo:,
 * iOS Apple Maps), then Google Maps on the web. Without coordinates, a search for the address.
 */
export const directionsUrls = (order: Pick<ShipperOrder, "latitude" | "longitude" | "deliveryAddress">, platform: "ios" | "android" | "web" | string): string[] => {
  if (order.latitude !== null && order.longitude !== null) {
    const point = `${order.latitude},${order.longitude}`;
    const web = `https://www.google.com/maps/dir/?api=1&destination=${point}`;
    if (platform === "android") return [`geo:${point}?q=${point}`, web];
    if (platform === "ios") return [`maps://?daddr=${point}`, web];
    return [web];
  }
  const query = encodeURIComponent(order.deliveryAddress ?? "");
  return [`https://www.google.com/maps/search/?api=1&query=${query}`];
};

/** Small read-only map with one pin (Leaflet + OpenStreetMap tiles; numbers only are put into the page). */
export const mapViewHtml = (latitude: number, longitude: number): string => {
  const lat = Number(latitude).toFixed(6);
  const lng = Number(longitude).toFixed(6);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div><script>
var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${lat}, ${lng}], 16);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
L.marker([${lat}, ${lng}]).addTo(map);
</script></body></html>`;
};
