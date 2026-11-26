/**
 * Kho card expiry: the caption ("HSD 24/11", "HSD 24/11/2028" in another year) and the corner pill. Expired items
 * (before they auto-hide) get a red "Hết hạn" pill and red caption; items expiring within 3 days an amber "Còn N
 * ngày" / "Hôm nay". The day is the expiry's calendar day as stored (YYYY-MM-DD) compared with today's local day.
 * Pure (no React Native), covered by expiry.test.ts.
 */
export const EXPIRING_SOON_DAYS = 3;

export type ExpiryTone = "danger" | "warning" | null;
export type ExpiryInfo = { text: string; tone: ExpiryTone; pill: { label: string; tone: "danger" | "warning" } | null };

/** Whole days from today (local calendar) to the expiry day; negative = already expired. */
export function daysUntil(expiryDate: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate);
  if (!match) return null;
  const expiry = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry - now) / 86_400_000);
}

export function expiryInfo(item: { expiryDate?: string | null; status?: string }, today: Date = new Date()): ExpiryInfo {
  const match = item.expiryDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(item.expiryDate) : null;
  if (!match || !item.expiryDate) {
    return item.status === "EXPIRED"
      ? { text: "Đã hết hạn", tone: "danger", pill: { label: "Hết hạn", tone: "danger" } }
      : { text: "Chưa có HSD", tone: null, pill: null };
  }
  const days = daysUntil(item.expiryDate, today) ?? 0;
  // The stored status may lag behind (it is recomputed on the server); the date decides on the device.
  const expired = days < 0 || item.status === "EXPIRED";
  const soon = !expired && days <= EXPIRING_SOON_DAYS;
  // Without the year, "HSD 24/11" of a later year looked like an expired date.
  const year = Number(match[1]) !== today.getFullYear() ? `/${match[1]}` : "";
  return {
    text: `HSD ${match[3]}/${match[2]}${year}`,
    tone: expired ? "danger" : soon ? "warning" : null,
    pill: expired ? { label: "Hết hạn", tone: "danger" } : soon ? { label: days === 0 ? "Hôm nay" : `Còn ${days} ngày`, tone: "warning" } : null,
  };
}
