/**
 * Kho card expiry: the caption ("HSD 24/11", "HSD 24/11/2028" in another year), the corner pill and whether the card
 * is dimmed. Days are Vietnam calendar days (Asia/Ho_Chi_Minh), the same as inventory-service.
 * - Within 3 days: amber "Còn N ngày".
 * - Expiry day: amber "Hết hạn hôm nay" (still usable).
 * - Grace days after expiry (the server's KHO_EXPIRED_GRACE_DAYS, returned with the Kho list; never hard-coded here):
 *   red "Đã hết hạn N ngày", red caption, dimmed card: only kept so it can be thrown away, never used for cooking.
 * - After that the server no longer lists the item.
 * Pure (no React Native), covered by expiry.test.ts.
 */
export const EXPIRING_SOON_DAYS = 3;

export type ExpiryTone = "danger" | "warning" | null;
export type ExpiryInfo = { text: string; tone: ExpiryTone; pill: { label: string; tone: "danger" | "warning" } | null; dimmed: boolean };

const VN_OFFSET_MS = 7 * 3_600_000;
const vietnamDay = (now: Date): Date => new Date(now.getTime() + VN_OFFSET_MS);

/** Whole Vietnam days from today to the stored expiry day (YYYY-MM-DD); 0 = today, negative = already expired. */
export function daysUntil(expiryDate: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expiryDate);
  if (!match) return null;
  const expiry = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const vn = vietnamDay(today);
  const now = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
  return Math.round((expiry - now) / 86_400_000);
}

/** "Đã hết hạn 2 ngày". */
export const expiredLabel = (daysAgo: number): string => `Đã hết hạn ${daysAgo} ngày`;

export function expiryInfo(item: { expiryDate?: string | null; status?: string }, today: Date = new Date()): ExpiryInfo {
  const match = item.expiryDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(item.expiryDate) : null;
  if (!match || !item.expiryDate) {
    return item.status === "EXPIRED"
      ? { text: "Đã hết hạn", tone: "danger", pill: { label: "Hết hạn", tone: "danger" }, dimmed: true }
      : { text: "Chưa có HSD", tone: null, pill: null, dimmed: false };
  }
  // The stored status may lag behind (it is recomputed on the server); the date decides on the device.
  const days = daysUntil(item.expiryDate, today) ?? 0;
  // Without the year, "HSD 24/11" of a later year looked like an expired date.
  const year = Number(match[1]) !== vietnamDay(today).getUTCFullYear() ? `/${match[1]}` : "";
  const text = `HSD ${match[3]}/${match[2]}${year}`;
  // Listed after its expiry day only during the server's grace days (a list loaded before midnight may still show it).
  if (days < 0) return { text, tone: "danger", pill: { label: expiredLabel(-days), tone: "danger" }, dimmed: true };
  if (days === 0) return { text, tone: "warning", pill: { label: "Hết hạn hôm nay", tone: "warning" }, dimmed: false };
  if (days <= EXPIRING_SOON_DAYS) return { text, tone: "warning", pill: { label: `Còn ${days} ngày`, tone: "warning" }, dimmed: false };
  return { text, tone: null, pill: null, dimmed: false };
}

/**
 * Items the Kho list shows: the server already hides rows past the grace days; this drops one that crossed Vietnam
 * midnight while the list was open (the server's `graceDays`, 0 by default). Rows without a date always stay.
 */
export function listedInKho<T extends { expiryDate?: string | null }>(items: readonly T[], graceDays: number, today: Date = new Date()): T[] {
  return items.filter((item) => {
    const days = item.expiryDate ? daysUntil(item.expiryDate, today) : null;
    return days === null || -days <= graceDays;
  });
}
