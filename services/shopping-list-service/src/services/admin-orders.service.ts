import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { inventory, notifyBuyer, shipperProfiles, type OrderStatus } from "./orders.service";

/**
 * Quản trị › "Đơn hàng": every delivery order across families (ADMIN only, routes in shopping-list.route.ts).
 * - list: one list of every order (optional status filter, counts per status for the same search), search by receiver
 *   name / phone / address, sorted by the LAST STATUS CHANGE, newest first, paginated; each row has `lastUpdatedAt` and
 *   the shipper's name once SHIPPING / DELIVERED. Every update of an order row is a status transition (updateMany with
 *   the status in the WHERE), so the row's `updatedAt` is that time (no new column). Only delivery orders (they have a
 *   delivery address); single-item direct purchases are not orders.
 * - detail: lines with prices, promotion, totals, address, receiver, shipper name / phone, status timeline, reason.
 * - cancel (PENDING only): the customer's cancel — Kho "Đang giao" rows removed, the order notice says "Đơn hàng đã hủy".
 * - unassign ("Gỡ người giao", SHIPPING only): back to PENDING without a shipper; the order notice says the order is
 *   waiting for another shipper (Kho keeps its "Đang giao" rows: the order is still coming).
 * Both actions are conditional updates (status in the WHERE) and audit-logged (OrderAuditLog).
 */
export const ADMIN_ORDER_STATUSES: OrderStatus[] = ["PENDING", "SHIPPING", "DELIVERED", "CANCELLED", "FAILED"];
const DELIVERY_ORDER = { deliveryAddress: { not: null } } as const;

/** Search terms → where: receiver name / address contain the text; phone digits match ignoring spaces / dots. */
export const searchWhere = (q: string | undefined) => {
  const text = q?.trim();
  if (!text) return {};
  const digits = text.replace(/[\s.+-]/g, "");
  return {
    OR: [
      { receiverName: { contains: text, mode: "insensitive" as const } },
      { deliveryAddress: { contains: text, mode: "insensitive" as const } },
      ...(/^\d{3,}$/.test(digits) ? [{ receiverPhone: { contains: digits.replace(/^84/, "") } }] : []),
    ],
  };
};

type TimelineSource = { purchasedAt: Date; shippingAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; failedAt: Date | null };
/** Status steps that happened, in time order. */
export const timelineOf = (order: TimelineSource): Array<{ status: OrderStatus; at: string }> => [
  { status: "PENDING" as const, at: order.purchasedAt },
  { status: "SHIPPING" as const, at: order.shippingAt },
  { status: "DELIVERED" as const, at: order.deliveredAt },
  { status: "CANCELLED" as const, at: order.cancelledAt },
  { status: "FAILED" as const, at: order.failedAt },
].filter((step): step is { status: OrderStatus; at: Date } => step.at !== null).sort((first, second) => first.at.getTime() - second.at.getTime()).map((step) => ({ status: step.status, at: step.at.toISOString() }));

const audit = (adminUserId: string, action: string, orderId: string, metadata: unknown) =>
  prisma.orderAuditLog.create({ data: { adminUserId, action, orderId, metadata: metadata as object } });

export class AdminOrdersService {
  static async list(options: { status?: OrderStatus; q?: string; page?: number; limit?: number }) {
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const page = Math.max(1, options.page ?? 1);
    const base = { ...DELIVERY_ORDER, ...searchWhere(options.q) };
    const where = { ...base, ...(options.status ? { status: options.status } : {}) };
    const [rows, total, grouped] = await Promise.all([
      prisma.purchase.findMany({
        where, orderBy: [{ updatedAt: "desc" }, { purchasedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit,
        select: { id: true, status: true, purchasedAt: true, updatedAt: true, shipperId: true, receiverName: true, deliveryAddress: true, itemCount: true, total: true, discountAmount: true },
      }),
      prisma.purchase.count({ where }),
      prisma.purchase.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(ADMIN_ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
    for (const row of grouped) counts[row.status as OrderStatus] = row._count._all;
    // "Người giao: <tên>" on SHIPPING / DELIVERED cards: names only (no shipper id or phone in the list).
    const withShipper = rows.filter((row) => row.shipperId && (row.status === "SHIPPING" || row.status === "DELIVERED"));
    const profiles = withShipper.length > 0 ? await shipperProfiles([...new Set(withShipper.map((row) => row.shipperId as string))]) : new Map<string, { name: string | null }>();
    return {
      items: rows.map(({ shipperId, updatedAt, ...row }) => ({
        ...row,
        purchasedAt: row.purchasedAt.toISOString(),
        lastUpdatedAt: updatedAt.toISOString(),
        shipperName: shipperId && (row.status === "SHIPPING" || row.status === "DELIVERED") ? profiles.get(shipperId)?.name ?? null : null,
      })),
      page, limit, total, counts,
    };
  }

  static async detail(id: string) {
    const order = await prisma.purchase.findFirst({
      where: { id, ...DELIVERY_ORDER },
      include: { items: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, quantity: true, unit: true, unitLabel: true, unitPrice: true, paidUnitPrice: true, discountPercent: true, lineTotal: true } } },
    });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    const profile = order.shipperId ? (await shipperProfiles([order.shipperId])).get(order.shipperId) ?? null : null;
    return {
      id: order.id, status: order.status, purchasedAt: order.purchasedAt.toISOString(),
      receiverName: order.receiverName, receiverPhone: order.receiverPhone, deliveryAddress: order.deliveryAddress, note: order.note,
      latitude: order.latitude, longitude: order.longitude, paymentMethod: order.paymentMethod,
      subtotal: order.subtotal || order.total, promotionName: order.promotionName, discountAmount: order.discountAmount, total: order.total, codAmount: order.codAmount,
      itemCount: order.itemCount, failReason: order.failReason,
      shipper: order.shipperId ? { name: profile?.name ?? null, phone: profile?.phone ?? null } : null,
      timeline: timelineOf(order),
      items: order.items.map((line) => ({
        id: line.id, name: line.name, quantity: line.quantity, unit: line.unit, unitLabel: line.unitLabel, unitPrice: line.paidUnitPrice,
        originalUnitPrice: line.discountPercent && line.unitPrice !== null && line.paidUnitPrice !== null && line.unitPrice > line.paidUnitPrice ? line.unitPrice : null,
        lineTotal: line.lineTotal,
      })),
    };
  }

  /** Admin cancel: same effects as the customer's cancel; only while PENDING. */
  static async cancel(adminUserId: string, id: string) {
    const order = await prisma.purchase.findFirst({ where: { id, ...DELIVERY_ORDER } });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    const changed = await prisma.purchase.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_CANCELLABLE", "Chỉ hủy được đơn đang chờ giao.");
    await audit(adminUserId, "CANCEL", id, { before: { status: order.status }, after: { status: "CANCELLED" } });
    // Kho's "Đang giao" rows go away (idempotent; the order is already cancelled if this has to be retried).
    await inventory(`/deliveries/${id}/cancel`, { familyId: order.familyId });
    await notifyBuyer({ ...order, status: "CANCELLED" });
    return this.detail(id);
  }

  /** "Gỡ người giao": a SHIPPING order goes back to PENDING without a shipper (another shipper can take it). */
  static async unassign(adminUserId: string, id: string) {
    const order = await prisma.purchase.findFirst({ where: { id, ...DELIVERY_ORDER } });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    const changed = await prisma.purchase.updateMany({ where: { id, status: "SHIPPING" }, data: { status: "PENDING", shipperId: null, shippingAt: null } });
    if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_SHIPPING", "Chỉ gỡ được người giao của đơn đang giao.");
    await audit(adminUserId, "UNASSIGN_SHIPPER", id, { before: { status: order.status, hadShipper: Boolean(order.shipperId) }, after: { status: "PENDING" } });
    await notifyBuyer({ ...order, status: "PENDING" });
    return this.detail(id);
  }
}
