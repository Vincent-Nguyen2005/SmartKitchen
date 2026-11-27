/**
 * Quản trị › "Doanh thu" — shipper cash reconciliation (pure; covered by adminBottomBar.test.ts): period choice and
 * title, the summary and shipper texts. Numbers come from shopping-list-service (DELIVERED orders, Vietnam days).
 */
export type RevenuePeriod = "today" | "7d" | "month";
export type ShipperDelivery = { id: string; deliveredAt: string; receiverName: string | null; total: number };
export type ShipperCash = { name: string | null; avatarUrl: string | null; direct: boolean; orders: number; amount: number; deliveries: ShipperDelivery[] };
export type RevenueReport = {
  period: { kind: RevenuePeriod; offset: number; firstDay: string; lastDay: string };
  /** Tổng tiền đã thu: Σ COD of the delivered orders. */
  total: number;
  orders: number;
  shippers: ShipperCash[];
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

/** "5 đơn đã giao". */
export const deliveredText = (orders: number): string => `${orders} đơn đã giao`;
/** "2 đơn". */
export const ordersText = (orders: number): string => `${orders} đơn`;

/** Shipper row title: the name, or "Mua trực tiếp" for older purchases without a shipper. */
export const shipperTitle = (shipper: Pick<ShipperCash, "name" | "direct">): string => (shipper.direct ? "Mua trực tiếp" : shipper.name ?? "Người giao");

/** The ‹ › arrows: never past the current period. */
export const canGoForward = (offset: number): boolean => offset < 0;
