/**
 * When an expired Kho item leaves Kho (pure; covered by kho-expiry.test.ts). Same rule for bought (PURCHASE) and
 * manual (MANUAL) rows, counted in Asia/Ho_Chi_Minh calendar days. Expiry dates are stored as YYYY-MM-DDT00:00:00Z.
 *
 * - Before the expiry day: a normal Kho item.
 * - On the expiry day ("Hết hạn hôm nay"): still listed and still usable.
 * - Grace days (KHO_EXPIRED_GRACE_DAYS, 0–7, default 0): from the day after expiry, for that many days, the item is
 *   still LISTED (dimmed, "Đã hết hạn N ngày", alert "đã hết hạn N ngày") so the user can throw it away, but it is
 *   never USED: not for cooking, the duplicate prompt, purchase merges or the weekly missing list.
 * - After the grace days (with 0: from the day after expiry): hidden from the Kho list and the alerts as well, and
 *   ignored everywhere. Rows stay in the database.
 * - Rows without an expiry date (NULL) are always listed and usable.
 */
export const KHO_EXPIRED_GRACE_MAX_DAYS = 7;
export const KHO_EXPIRED_GRACE_DEFAULT_DAYS = 0;

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * KHO_EXPIRED_GRACE_DAYS → whole days 0–7. Missing / empty = 0. Anything else that is not an integer in range falls
 * back to 0 and logs one line (the setting name and the rule only, never the value's surroundings or any data).
 */
export function parseGraceDays(raw: string | undefined, log: (message: string) => void = (message) => console.warn(message)): number {
  if (raw === undefined || raw.trim() === "") return KHO_EXPIRED_GRACE_DEFAULT_DAYS;
  const text = raw.trim();
  const value = Number(text);
  if (/^\d+$/.test(text) && Number.isInteger(value) && value >= 0 && value <= KHO_EXPIRED_GRACE_MAX_DAYS) return value;
  log(`[inventory] KHO_EXPIRED_GRACE_DAYS must be a whole number from 0 to ${KHO_EXPIRED_GRACE_MAX_DAYS}; using ${KHO_EXPIRED_GRACE_DEFAULT_DAYS}.`);
  return KHO_EXPIRED_GRACE_DEFAULT_DAYS;
}

let cached: { raw: string | undefined; days: number } | null = null;
/** The effective grace days from the environment (parsed once per distinct value, so the warning is logged once). */
export function khoExpiredGraceDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.KHO_EXPIRED_GRACE_DAYS;
  if (!cached || cached.raw !== raw) cached = { raw, days: parseGraceDays(raw) };
  return cached.days;
}

/** Today's Vietnam calendar day as UTC midnight (the form expiry dates are stored in). */
export const vietnamToday = (now: Date = new Date()): Date =>
  new Date(`${new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)}T00:00:00.000Z`);

const addDays = (day: Date, days: number): Date => new Date(day.getTime() + days * DAY_MS);

/** Whole Vietnam days from today to the expiry day (0 = today, negative = days since expiry); null without a date. */
export function daysLeft(expiryDate: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  expiry.setUTCHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - vietnamToday(now).getTime()) / DAY_MS);
}

export type KhoExpiryStage = "no_expiry" | "fresh" | "today" | "grace" | "hidden";

/** The stage of one item (see the module comment). */
export function expiryStage(expiryDate: Date | string | null | undefined, graceDays: number, now: Date = new Date()): KhoExpiryStage {
  const left = daysLeft(expiryDate, now);
  if (left === null) return "no_expiry";
  if (left > 0) return "fresh";
  if (left === 0) return "today";
  return -left <= graceDays ? "grace" : "hidden";
}

/**
 * Prisma condition: rows still LISTED in Kho (and the alerts): no expiry, or expiry day on or after today − grace.
 * Written as NOT (expiryDate IS NOT NULL AND expiryDate < cutoff): without `not: null`, SQL would evaluate
 * NOT (NULL < cutoff) to NULL and drop every row without an expiry date.
 */
export function listedInKhoFilter(graceDays: number, now: Date = new Date()) {
  return { NOT: { expiryDate: { not: null, lt: addDays(vietnamToday(now), -graceDays) } } };
}

/** Prisma condition: rows that may be USED (cooking): no expiry, or expiry day today or later. NULL-safe as above. */
export function usableInKhoFilter(now: Date = new Date()) {
  return { NOT: { expiryDate: { not: null, lt: vietnamToday(now) } } };
}

/**
 * Prisma condition for rows new stock may join (duplicate prompt, "Cộng thêm", purchase merges): usable rows, plus
 * used-up (CONSUMED) rows whatever their old expiry (they restart as a fresh batch and inherit nothing stale).
 * NOT (status <> CONSUMED AND expiryDate IS NOT NULL AND expiryDate < today).
 */
export function mergeableInKhoFilter(now: Date = new Date()) {
  return { NOT: { status: { not: "CONSUMED" as const }, expiryDate: { not: null, lt: vietnamToday(now) } } };
}

/** The same rule as mergeableInKhoFilter for one loaded row. */
export const isExpiredForUse = (row: { status: string; expiryDate: Date | null }, now: Date = new Date()): boolean =>
  row.status !== "CONSUMED" && row.expiryDate !== null && row.expiryDate < vietnamToday(now);
