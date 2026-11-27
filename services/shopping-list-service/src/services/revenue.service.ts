import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { shipperProfiles } from "./orders.service";
import { changePercent, groupTotals } from "./spending.service";

/**
 * Quản trị › "Doanh thu" (ADMIN only). DELIVERED orders only, counted on their delivery day (Asia/Ho_Chi_Minh).
 * - Periods: today, the last 7 days (today included) or this calendar month; `offset` (≤ 0) steps back period by
 *   period (‹ ›). The comparison period is the one right before (same length; the previous month for months).
 * - Revenue = sum of order totals (after per-item / daily-deal discounts and the checkout promotion) = COD collected.
 * - Discounts: per-item (incl. daily deals) = Σ round(original unit price × quantity) − line total; promotions = Σ
 *   order discountAmount.
 * - Groups and top products count lineTotal − discountShare (the promotion split on the lines, as in Chi tiêu), so the
 *   groups add up to the revenue. Per shipper: Σ order totals per shipper ("Không qua giao hàng" for direct purchases),
 *   which also adds up to the revenue.
 */
export type PeriodKind = "today" | "7d" | "month";
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const vnDayOf = (date: Date): string => new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const startOfVnDay = (day: string): Date => new Date(Date.parse(`${day}T00:00:00.000Z`) - VN_OFFSET_MS);
const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export type PeriodRange = { kind: PeriodKind; from: Date; to: Date; firstDay: string; lastDay: string; days: string[] };

/** [from, to) in UTC and the Vietnam days of the period `offset` steps back from the one containing `now`. */
export function periodRange(kind: PeriodKind, offset: number, now: Date = new Date()): PeriodRange {
  const today = vnDayOf(now);
  let firstDay: string;
  let lastDay: string;
  if (kind === "today") {
    firstDay = lastDay = addDays(today, offset);
  } else if (kind === "7d") {
    lastDay = addDays(today, offset * 7);
    firstDay = addDays(lastDay, -6);
  } else {
    const [year, month] = today.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1 + offset, 1));
    firstDay = first.toISOString().slice(0, 10);
    lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }
  const days: string[] = [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) days.push(day);
  return { kind, from: startOfVnDay(firstDay), to: startOfVnDay(addDays(lastDay, 1)), firstDay, lastDay, days };
}

export type RevenueOrder = {
  total: number;
  discountAmount: number;
  deliveredAt: Date;
  shipperId: string | null;
  items: Array<{ productId: string | null; name: string; quantity: number; unit: string; unitLabel: string | null; unitPrice: number | null; lineTotal: number | null; discountShare: number; groupName: string | null }>;
};

/** The period's numbers from its delivered orders (pure; shipper names are filled in afterwards). */
export function summarize(orders: RevenueOrder[], range: PeriodRange) {
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const promotionDiscounts = orders.reduce((sum, order) => sum + (order.discountAmount ?? 0), 0);
  let itemDiscounts = 0;
  const perDay = new Map(range.days.map((day) => [day, 0]));
  const products = new Map<string, { name: string; quantity: number; unit: string; unitLabel: string | null; revenue: number }>();
  const shippers = new Map<string | null, { orders: number; amount: number }>();
  for (const order of orders) {
    const day = vnDayOf(order.deliveredAt);
    perDay.set(day, (perDay.get(day) ?? 0) + order.total);
    const shipper = shippers.get(order.shipperId) ?? { orders: 0, amount: 0 };
    shippers.set(order.shipperId, { orders: shipper.orders + 1, amount: shipper.amount + order.total });
    for (const line of order.items) {
      if (line.lineTotal === null) continue;
      if (line.unitPrice !== null) itemDiscounts += Math.max(0, Math.round(line.unitPrice * line.quantity) - line.lineTotal);
      const key = line.productId ?? `name:${line.name.trim().toLocaleLowerCase("vi")}`;
      const product = products.get(key) ?? { name: line.name, quantity: 0, unit: line.unit, unitLabel: line.unitLabel, revenue: 0 };
      products.set(key, { ...product, quantity: Math.round((product.quantity + line.quantity) * 1000) / 1000, revenue: product.revenue + line.lineTotal - (line.discountShare ?? 0) });
    }
  }
  return {
    total,
    orders: orders.length,
    average: orders.length > 0 ? Math.round(total / orders.length) : 0,
    discounts: { items: itemDiscounts, promotions: promotionDiscounts },
    days: range.days.map((day) => ({ day, total: perDay.get(day) ?? 0 })),
    topProducts: [...products.values()].sort((first, second) => second.revenue - first.revenue || first.name.localeCompare(second.name, "vi")).slice(0, 5),
    groups: groupTotals(orders.flatMap((order) => order.items.map((line) => ({ lineTotal: line.lineTotal, groupName: line.groupName, discountShare: line.discountShare })))),
    shippers: [...shippers].map(([shipperId, value]) => ({ shipperId, ...value })).sort((first, second) => second.amount - first.amount),
  };
}

const ORDER_SELECT = {
  total: true, discountAmount: true, deliveredAt: true, shipperId: true,
  items: { select: { productId: true, name: true, quantity: true, unit: true, unitLabel: true, unitPrice: true, lineTotal: true, discountShare: true, groupName: true } },
} as const;

const deliveredIn = async (range: PeriodRange): Promise<RevenueOrder[]> => {
  const rows = await prisma.purchase.findMany({ where: { status: "DELIVERED", deliveredAt: { gte: range.from, lt: range.to } }, select: ORDER_SELECT });
  return rows.filter((row): row is typeof row & { deliveredAt: Date } => row.deliveredAt !== null);
};

export class RevenueService {
  static async report(kind: PeriodKind, offset: number, now: Date = new Date()) {
    if (offset > 0) throw new AppError(400, "INVALID_PERIOD", "Only past or current periods.");
    const range = periodRange(kind, offset, now);
    const previousRange = periodRange(kind, offset - 1, now);
    const [orders, previousOrders] = await Promise.all([deliveredIn(range), deliveredIn(previousRange)]);
    const summary = summarize(orders, range);
    const previousTotal = previousOrders.reduce((sum, order) => sum + order.total, 0);
    const profiles = await shipperProfiles(summary.shippers.flatMap((row) => (row.shipperId ? [row.shipperId] : [])));
    return {
      period: { kind, offset, firstDay: range.firstDay, lastDay: range.lastDay },
      ...summary,
      // Names only (no ids or phones leave for this report); null shipper = bought directly, not delivered.
      shippers: summary.shippers.map(({ shipperId, ...row }) => ({ name: shipperId ? profiles.get(shipperId)?.name ?? "Người giao (không rõ tên)" : null, direct: shipperId === null, ...row })),
      previous: { firstDay: previousRange.firstDay, lastDay: previousRange.lastDay, total: previousTotal, orders: previousOrders.length },
      changePercent: changePercent(summary.total, previousTotal),
    };
  }
}
