/**
 * Quản trị › "Doanh thu" (pure; covered by revenue.test.ts): period choice and title, comparison line, chart bars,
 * product and shipper texts. Numbers come from shopping-list-service (DELIVERED orders, Vietnam delivery days).
 */
import { amountText } from "../shopping-cart/unitDisplay";

export type RevenuePeriod = "today" | "7d" | "month";
export type RevenueReport = {
  period: { kind: RevenuePeriod; offset: number; firstDay: string; lastDay: string };
  total: number;
  orders: number;
  average: number;
  discounts: { items: number; promotions: number };
  days: Array<{ day: string; total: number }>;
  topProducts: Array<{ name: string; quantity: number; unit: string; unitLabel: string | null; revenue: number }>;
  groups: Array<{ name: string; amount: number; percent: number }>;
  shippers: Array<{ name: string | null; direct: boolean; orders: number; amount: number }>;
  previous: { firstDay: string; lastDay: string; total: number; orders: number };
  changePercent: number | null;
};

export const PERIOD_OPTIONS: ReadonlyArray<{ value: RevenuePeriod; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "month", label: "Tháng này" },
];

const dayMonth = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** "Hôm nay, 01/12" / "Thứ Hai, 30/11" / "25/11 – 01/12" / "Tháng 12/2026". */
export function periodTitle(period: { kind: RevenuePeriod; offset: number; firstDay: string; lastDay: string }): string {
  if (period.kind === "today") return `${period.offset === 0 ? "Hôm nay" : WEEKDAYS[new Date(`${period.firstDay}T00:00:00Z`).getUTCDay()]}, ${dayMonth(period.firstDay)}`;
  if (period.kind === "7d") return `${dayMonth(period.firstDay)} – ${dayMonth(period.lastDay)}`;
  return `Tháng ${Number(period.firstDay.slice(5, 7))}/${period.firstDay.slice(0, 4)}`;
}

/** "+12% so với kỳ trước" (success), "−5% so với kỳ trước" (danger), "Bằng kỳ trước", or no previous revenue. */
export function comparisonText(changePercent: number | null): { text: string; tone: "up" | "down" | "flat" } {
  if (changePercent === null) return { text: "Kỳ trước chưa có doanh thu", tone: "flat" };
  if (changePercent === 0) return { text: "Bằng kỳ trước", tone: "flat" };
  return changePercent > 0 ? { text: `+${changePercent}% so với kỳ trước`, tone: "up" } : { text: `−${Math.abs(changePercent)}% so với kỳ trước`, tone: "down" };
}

/** Bars for the per-day chart: day-of-month labels (the month view labels every 5th day to stay readable). */
export const chartBars = (days: RevenueReport["days"], kind: RevenuePeriod): Array<{ label: string; value: number }> =>
  days.map((day, index) => ({ label: kind === "month" && index % 5 !== 0 && index !== days.length - 1 ? "" : kind === "7d" ? dayMonth(day.day) : String(Number(day.day.slice(8, 10))), value: day.total }));

/** "1,5 kg", "3 quả" (sale unit word). */
export const productQuantity = (product: RevenueReport["topProducts"][number]): string => amountText(product.quantity, product.unit, product.unitLabel);

/** Shipper row title: the name, or "Mua trực tiếp" for purchases not delivered by a shipper. */
export const shipperTitle = (shipper: RevenueReport["shippers"][number]): string => (shipper.direct ? "Mua trực tiếp" : shipper.name ?? "Người giao");

/** The ‹ › arrows: never past the current period. */
export const canGoForward = (offset: number): boolean => offset < 0;
