import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { shipperProfiles } from "./orders.service";

/**
 * Quản trị › "Doanh thu" (ADMIN only): shipper cash reconciliation. DELIVERED orders only, counted on their delivery
 * day (Asia/Ho_Chi_Minh), for today, the last 7 days (today included) or this calendar month; `offset` (≤ 0) steps
 * back period by period (‹ ›).
 * - Tổng tiền đã thu = Σ COD amount of the delivered orders; "<N> đơn đã giao".
 * - Per shipper: name, avatar, order count, amount (sorted by amount), and that shipper's delivered orders in the
 *   period (time, receiver name, total), newest first. Older purchases without a shipper are one "Mua trực tiếp" row,
 *   only when there are any. The per-shipper amounts add up to the total.
 */
export type PeriodKind = "today" | "7d" | "month";
const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const vnDayOf = (date: Date): string => new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const startOfVnDay = (day: string): Date => new Date(Date.parse(`${day}T00:00:00.000Z`) - VN_OFFSET_MS);
const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export type PeriodRange = { kind: PeriodKind; from: Date; to: Date; firstDay: string; lastDay: string };

/** [from, to) in UTC and the first / last Vietnam day of the period `offset` steps back from the one containing `now`. */
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
  return { kind, from: startOfVnDay(firstDay), to: startOfVnDay(addDays(lastDay, 1)), firstDay, lastDay };
}

export type DeliveredOrder = { id: string; codAmount: number; deliveredAt: Date; shipperId: string | null; receiverName: string | null };
export type ShipperCash = { shipperId: string | null; orders: number; amount: number; deliveries: Array<{ id: string; deliveredAt: string; receiverName: string | null; total: number }> };

/** Totals and per-shipper cash from the period's delivered orders (pure; names are filled in afterwards). */
export function reconcile(orders: DeliveredOrder[]): { total: number; orders: number; shippers: ShipperCash[] } {
  const byShipper = new Map<string | null, ShipperCash>();
  for (const order of orders) {
    const row = byShipper.get(order.shipperId) ?? { shipperId: order.shipperId, orders: 0, amount: 0, deliveries: [] };
    row.orders += 1;
    row.amount += order.codAmount;
    row.deliveries.push({ id: order.id, deliveredAt: order.deliveredAt.toISOString(), receiverName: order.receiverName, total: order.codAmount });
    byShipper.set(order.shipperId, row);
  }
  const shippers = [...byShipper.values()]
    .map((row) => ({ ...row, deliveries: row.deliveries.sort((first, second) => second.deliveredAt.localeCompare(first.deliveredAt)) }))
    // Highest amount first; "Mua trực tiếp" (no shipper) last on a tie.
    .sort((first, second) => second.amount - first.amount || Number(first.shipperId === null) - Number(second.shipperId === null));
  return { total: orders.reduce((sum, order) => sum + order.codAmount, 0), orders: orders.length, shippers };
}

export class RevenueService {
  static async report(kind: PeriodKind, offset: number, now: Date = new Date()) {
    if (offset > 0) throw new AppError(400, "INVALID_PERIOD", "Only past or current periods.");
    const range = periodRange(kind, offset, now);
    const rows = await prisma.purchase.findMany({
      where: { status: "DELIVERED", deliveredAt: { gte: range.from, lt: range.to } },
      select: { id: true, codAmount: true, total: true, deliveredAt: true, shipperId: true, receiverName: true },
    });
    // COD amount (= order total for delivery orders; older direct purchases store the total).
    const orders = rows.flatMap((row) => (row.deliveredAt ? [{ id: row.id, codAmount: row.codAmount || row.total, deliveredAt: row.deliveredAt, shipperId: row.shipperId, receiverName: row.receiverName }] : []));
    const summary = reconcile(orders);
    const profiles = await shipperProfiles(summary.shippers.flatMap((row) => (row.shipperId ? [row.shipperId] : [])));
    return {
      period: { kind, offset, firstDay: range.firstDay, lastDay: range.lastDay },
      total: summary.total,
      orders: summary.orders,
      // Name and avatar only (no ids or phones); direct = bought without a shipper.
      shippers: summary.shippers.map(({ shipperId, ...row }) => ({
        name: shipperId ? profiles.get(shipperId)?.name ?? "Người giao (không rõ tên)" : null,
        avatarUrl: shipperId ? profiles.get(shipperId)?.avatarUrl ?? null : null,
        direct: shipperId === null,
        ...row,
      })),
    };
  }
}
