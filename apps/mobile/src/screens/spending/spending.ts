/**
 * "Chi tiêu" (family spending from Đi chợ purchases): types of GET /api/shopping-list/spending and pure display
 * helpers (no React Native), covered by spending.test.ts. Months and times are Vietnam time (UTC+7, no DST).
 */
import { formatVnd } from "../../services/format";
import { amountText } from "../shopping-cart/unitDisplay";

export type SpendingLine = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitLabel: string | null;
  /** Unit price paid (after the discount); null when the line had no price. */
  unitPrice: number | null;
  /** Price before the discount, only when a discount applied (shown struck through). */
  originalUnitPrice: number | null;
  discountPercent: number | null;
  lineTotal: number | null;
  group: string;
};
export type SpendingPurchase = {
  id: string; purchasedAt: string; buyerUserId: string | null; itemCount: number;
  /** Paid (after the checkout promotion). */
  total: number;
  subtotal?: number; promotionName?: string | null; discountAmount?: number;
  lines: SpendingLine[];
};
export type SpendingGroup = { name: string; amount: number; percent: number };
export type MonthSpending = {
  month: string;
  previousMonth: string;
  total: number;
  previousTotal: number;
  changePercent: number | null;
  purchaseCount: number;
  groups: SpendingGroup[];
  purchases: { items: SpendingPurchase[]; page: number; limit: number; total: number };
};

const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (value: number): string => String(value).padStart(2, "0");

/** The Vietnam month (YYYY-MM) of `now`. */
export const currentMonth = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 7);

/** 2026-11 + 1 → 2026-12; 2026-01 − 1 → 2025-12. */
export const shiftMonth = (month: string, delta: number): string => {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
};

/** No future months: "›" only while the shown month is before the current one. */
export const canGoNext = (month: string, now: Date = new Date()): boolean => month < currentMonth(now);

/** "Tháng 11/2026". */
export const monthTitle = (month: string): string => {
  const [year, index] = month.split("-").map(Number);
  return `Tháng ${index}/${year}`;
};

/** "tháng 10" (in the comparison line). */
const monthWord = (month: string): string => `tháng ${Number(month.split("-")[1])}`;

/** "↑ 12% so với tháng 10" (more: danger) / "↓ 5% so với tháng 10" (less: success); null without a previous month. */
export const comparisonLine = (changePercent: number | null, previousMonth: string): { text: string; tone: "up" | "down" | "same" } | null => {
  if (changePercent === null) return null;
  if (changePercent === 0) return { text: `Bằng ${monthWord(previousMonth)}`, tone: "same" };
  return { text: `${changePercent > 0 ? "↑" : "↓"} ${Math.abs(changePercent)}% so với ${monthWord(previousMonth)}`, tone: changePercent > 0 ? "up" : "down" };
};

/** "1.250.000đ" (dots, no decimals). */
export const vnd = (amount: number): string => formatVnd(amount);
/** For screen readers: "1.250.000 đồng". */
export const vndSpoken = (amount: number): string => `${formatVnd(amount).replace(/đ$/, "")} đồng`;

/** "26/11 · 18:05" (Vietnam time). */
export const purchaseTime = (iso: string): string => {
  const shifted = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)} · ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
};

/** "1,5 kg", "2 gói", "3 quả". */
export const lineQuantity = (line: Pick<SpendingLine, "quantity" | "unit" | "unitLabel">): string => amountText(line.quantity, line.unit, line.unitLabel);

/** "3 món". */
export const itemCountText = (count: number): string => `${count} món`;

/** Bars: each group's width relative to the largest group (0..1), so the top group fills the track. */
export const barFractions = (groups: SpendingGroup[]): number[] => {
  const max = Math.max(0, ...groups.map((group) => group.amount));
  return groups.map((group) => (max > 0 ? group.amount / max : 0));
};

export type Member = { userId: string; displayName?: string | null; avatarUrl?: string | null };
/** The buyer among the family members; someone who left (or a purchase from before buyers were recorded) gets a neutral label. */
export const buyerOf = (members: Member[], buyerUserId: string | null): { name: string; avatarUrl: string | null } => {
  if (!buyerUserId) return { name: "Không rõ người mua", avatarUrl: null };
  const member = members.find((entry) => entry.userId === buyerUserId);
  return member ? { name: member.displayName?.trim() || "Thành viên", avatarUrl: member.avatarUrl ?? null } : { name: "Thành viên cũ", avatarUrl: null };
};
