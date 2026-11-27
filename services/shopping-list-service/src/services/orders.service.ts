import { randomUUID } from "node:crypto";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { LIST_STATUS } from "../lib/constants";
import { normalizedName } from "./shopping-list.service";
import { lineTotalOf, paidUnitPrice, type CatalogInfo } from "./spending.service";

/**
 * Đi chợ delivery orders, paid cash on delivery (COD).
 * - place (customer, "Đặt hàng"): the cart lines become one PENDING order (price snapshots, total = sum of rounded
 *   line totals = COD amount); Kho gets "Đang giao" rows for them first (inventory-service), so a failed Kho call
 *   leaves the cart untouched. The lines leave the cart (they are linked to the order).
 * - cancel (any member of the family, only while PENDING) → CANCELLED; Kho's "Đang giao" rows are removed.
 * - accept (SHIPPER, PENDING → SHIPPING, assigns the shipper), deliver (that shipper, SHIPPING → DELIVERED: the lines
 *   become normal Kho rows with expiry = delivery day + shelf life), fail (that shipper, SHIPPING → FAILED with a
 *   reason; Kho rows removed).
 * Transitions are enforced with conditional updates (status in the WHERE), so races cannot skip a state, and every
 * call is idempotent: repeating the same transition answers the order and re-runs its Kho step.
 */
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || (process.env.NODE_ENV === "production" ? "http://inventory-service:4003" : "http://localhost:4003");
const PURCHASE_SYNC_API_KEY = process.env.PURCHASE_SYNC_API_KEY || (process.env.NODE_ENV === "production" ? "" : "dev-only-purchase-sync-key-change-me");
const VN_OFFSET_MS = 7 * 3_600_000;

export type OrderStatus = "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "FAILED";
export type DeliveryInput = { address: string; latitude?: number | null; longitude?: number | null; receiverName: string; receiverPhone: string; note?: string | null };
export type OrderLineExtras = { id: string; categoryName?: string; shelfLifeDays?: number };

/** Vietnamese mobile / landline numbers: 0xxxxxxxxx or +84xxxxxxxxx (10 digits after the leading 0). */
export const VN_PHONE = /^(?:\+84|84|0)(?:3|5|7|8|9|2\d)\d{8}$/;
export const normalizePhone = (value: string): string => value.replace(/[\s.-]/g, "");

/** Vietnam day (YYYY-MM-DD) of `date` plus `days`. */
export const vnDayPlus = (date: Date, days: number): string => {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

const inventory = async (path: string, body: unknown): Promise<void> => {
  try {
    const response = await axios.post(`${INVENTORY_API_URL}/api/inventory/internal${path}`, body, { headers: { "x-internal-api-key": PURCHASE_SYNC_API_KEY }, timeout: 10_000 });
    if (response.data?.success !== true) throw new Error("rejected");
  } catch {
    throw new AppError(503, "INVENTORY_SYNC_FAILED", "Kho could not be updated. Try again.");
  }
};

const AUTH_SERVICE_URL = () => (process.env.AUTH_SERVICE_URL || (process.env.NODE_ENV === "production" ? "http://auth-service:4001" : "http://localhost:4001")).replace(/\/+$/, "");
const NOTIFICATION_SERVICE_URL = () => (process.env.NOTIFICATION_SERVICE_URL || (process.env.NODE_ENV === "production" ? "http://notification-service:4010" : "http://localhost:4010")).replace(/\/+$/, "");

/** Distance in km between two points (haversine). */
export const distanceKm = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude);
  const dLng = rad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Thông báo feed rows for the buyer when the order moves (in-app only, no push); one per order and status. */
export const ORDER_NOTICES: Partial<Record<OrderStatus, (reason: string | null) => { title: string; body: string }>> = {
  SHIPPING: () => ({ title: "Đơn hàng đang được giao", body: "Người giao hàng đã nhận đơn và đang trên đường giao." }),
  DELIVERED: () => ({ title: "Đơn hàng đã giao thành công", body: "Các món đã được thêm vào Kho của gia đình." }),
  FAILED: (reason) => ({ title: `Đơn hàng không giao được: ${reason ?? "không rõ lý do"}`, body: "Các món \"Đang giao\" đã được bỏ khỏi Kho. Bạn có thể đặt lại." }),
  CANCELLED: () => ({ title: "Đơn hàng đã hủy", body: "Các món \"Đang giao\" đã được bỏ khỏi Kho." }),
};
/** One Thông báo row per order: every status change replaces it (latest status, unread again, moved to the top). */
export const orderNoticeKey = (orderId: string): string => `order:${orderId}`;
const notifyBuyer = async (order: { id: string; buyerUserId: string | null; status: string; failReason: string | null }): Promise<void> => {
  const notice = ORDER_NOTICES[order.status as OrderStatus];
  const key = process.env.INTERNAL_API_KEY;
  if (!notice || !order.buyerUserId || !key) return;
  const { title, body } = notice(order.failReason);
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL()}/internal/notifications`, {
      userId: order.buyerUserId, type: "SYSTEM", title, body,
      data: { type: "order", orderId: order.id, status: order.status },
      // One row per order, replaced on each status change; a retry with the same text changes nothing.
      dedupeKey: orderNoticeKey(order.id),
      replace: true,
    }, { headers: { "x-api-key": key }, timeout: 5000 });
  } catch {
    console.warn(JSON.stringify({ event: "order_notice_failed", status: order.status }));
  }
};

/** Shipper name and phone (auth-service), for the family once an order is on its way. */
const shipperProfiles = async (ids: string[]): Promise<Map<string, { name: string | null; phone: string | null }>> => {
  const profiles = new Map<string, { name: string | null; phone: string | null }>();
  const key = process.env.INTERNAL_API_KEY;
  if (ids.length === 0 || !key) return profiles;
  try {
    const response = await axios.post(`${AUTH_SERVICE_URL()}/internal/admin/users/profiles`, { ids: [...new Set(ids)] }, { headers: { "x-api-key": key }, timeout: 5000 });
    for (const item of (response.data?.items ?? []) as Array<{ id: string; name: string | null; phone?: string | null }>) profiles.set(item.id, { name: item.name, phone: item.phone ?? null });
  } catch {
    // The list still shows, only without the shipper's name and phone.
  }
  return profiles;
};

type ShipperLine = { name: string; quantity: number; unit: string; unitLabel: string | null; paidUnitPrice: number | null; unitPrice: number | null; discountPercent: number | null; lineTotal: number | null };
type ShipperOrderRow = {
  id: string; status: string; purchasedAt: Date; shippingAt: Date | null; deliveredAt: Date | null; failedAt: Date | null; failReason: string | null; shipperId: string | null;
  deliveryAddress: string | null; latitude: number | null; longitude: number | null; receiverName: string | null; receiverPhone: string | null; note: string | null;
  paymentMethod: string; codAmount: number; itemCount: number; items: ShipperLine[];
};
/**
 * What a shipper sees: delivery data and a receipt (unit price after discount, original price when discounted, line
 * total, COD amount). No family, buyer or other user data.
 */
export const shipperOrderView = (order: ShipperOrderRow, origin?: { latitude: number; longitude: number } | null) => ({
  id: order.id, status: order.status, orderedAt: order.purchasedAt.toISOString(),
  shippingAt: order.shippingAt?.toISOString() ?? null, deliveredAt: order.deliveredAt?.toISOString() ?? null,
  failedAt: order.failedAt?.toISOString() ?? null, failReason: order.failReason,
  deliveryAddress: order.deliveryAddress, latitude: order.latitude, longitude: order.longitude,
  distanceKm: origin && order.latitude !== null && order.longitude !== null ? Math.round(distanceKm(origin, { latitude: order.latitude, longitude: order.longitude }) * 10) / 10 : null,
  receiverName: order.receiverName, receiverPhone: order.receiverPhone, note: order.note,
  paymentMethod: order.paymentMethod, codAmount: order.codAmount, itemCount: order.itemCount,
  items: order.items.map((line) => ({
    name: line.name, quantity: line.quantity, unit: line.unit, unitLabel: line.unitLabel,
    unitPrice: line.paidUnitPrice,
    originalUnitPrice: line.discountPercent && line.unitPrice !== null && line.paidUnitPrice !== null && line.unitPrice > line.paidUnitPrice ? line.unitPrice : null,
    lineTotal: line.lineTotal,
  })),
});
const SHIPPER_ITEMS = { items: { orderBy: { createdAt: "asc" as const }, select: { name: true, quantity: true, unit: true, unitLabel: true, paidUnitPrice: true, unitPrice: true, discountPercent: true, lineTotal: true } } };
export type ShipperScope = "available" | "mine" | "history";
const HISTORY_DAYS = 30;

type LineRow = { id: string; name: string; quantity: number; unit: string; productId: string | null; groupName: string | null; unitLabel: string | null; shelfLifeDays: number | null };
const inventoryLine = (line: LineRow) => ({
  externalPurchaseId: line.id, name: line.name, quantity: line.quantity, unit: line.unit,
  ...(line.productId ? { productId: line.productId } : {}),
  ...(line.groupName ? { categoryName: line.groupName.slice(0, 50) } : {}),
  ...(line.unitLabel ? { unitLabel: line.unitLabel } : {}),
});
const LINE_SELECT = { id: true, name: true, quantity: true, unit: true, productId: true, groupName: true, unitLabel: true, shelfLifeDays: true, unitPrice: true, discountPercent: true, paidUnitPrice: true, lineTotal: true } as const;

/** Order as the family sees it (lines included). */
const ORDER_INCLUDE = { items: { orderBy: { createdAt: "asc" as const }, select: LINE_SELECT } };

export class OrdersService {
  static async place(familyId: string, buyerUserId: string, delivery: DeliveryInput, extras: OrderLineExtras[], catalog: Map<string, CatalogInfo & { shelfLifeDays?: number }>) {
    if (!buyerUserId) throw new AppError(400, "BUYER_REQUIRED", "An order needs the buyer.");
    const list = await prisma.shoppingList.findFirst({ where: { activeFamilyId: familyId }, orderBy: { createdAt: "desc" } });
    const cart = list ? await prisma.shoppingItem.findMany({
      where: { shoppingListId: list.id, inventoryAppliedAt: null, purchaseId: null },
      orderBy: { createdAt: "asc" },
    }) : [];
    if (!list || cart.length === 0) throw new AppError(409, "CART_EMPTY", "The cart is empty.");
    const extrasById = new Map(extras.map((line) => [line.id, line]));
    const lines = cart.map((item) => {
      const info = item.productId ? catalog.get(item.productId) : undefined;
      const extra = extrasById.get(item.id);
      // The cart's price: the snapshot taken when added; else the catalog's current price (as the cart showed it).
      const unitPrice = item.unitPrice ?? (typeof info?.price === "number" ? info.price : null);
      const discountPercent = item.unitPrice !== null ? item.discountPercent : info?.discountPercent ?? null;
      const paid = unitPrice === null ? null : paidUnitPrice(unitPrice, discountPercent);
      return {
        item, unitPrice, discountPercent, paid, lineTotal: lineTotalOf(paid, item.quantity),
        groupName: info?.group ?? extra?.categoryName ?? null,
        unitLabel: info?.unitLabel ?? null,
        shelfLifeDays: info?.shelfLifeDays ?? extra?.shelfLifeDays ?? null,
      };
    });
    const total = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
    const orderId = randomUUID();
    // Kho first ("Đang giao" rows, idempotent): if it fails nothing else was written and the cart stays.
    await inventory("/deliveries/pending", {
      orderId, familyId, createdByUserId: buyerUserId,
      lines: lines.map((line) => inventoryLine({ ...line.item, groupName: line.groupName, unitLabel: line.unitLabel, shelfLifeDays: line.shelfLifeDays })),
    });
    try {
      const order = await prisma.$transaction(async (transaction) => {
        await transaction.purchase.create({
          data: {
            id: orderId, familyId, buyerUserId, purchasedAt: new Date(), total, codAmount: total, itemCount: lines.length, status: "PENDING", paymentMethod: "COD",
            deliveryAddress: delivery.address, latitude: delivery.latitude ?? null, longitude: delivery.longitude ?? null,
            receiverName: delivery.receiverName, receiverPhone: normalizePhone(delivery.receiverPhone), note: delivery.note || null,
          },
        });
        for (const line of lines) {
          const updated = await transaction.shoppingItem.updateMany({
            where: { id: line.item.id, purchaseId: null, inventoryAppliedAt: null },
            data: {
              purchaseId: orderId, unitPrice: line.unitPrice, discountPercent: line.discountPercent, paidUnitPrice: line.paid,
              lineTotal: line.lineTotal, groupName: line.groupName, unitLabel: line.unitLabel, shelfLifeDays: line.shelfLifeDays, generatedKey: null,
            },
          });
          if (updated.count !== 1) throw new AppError(409, "CART_CHANGED", "The cart changed meanwhile; try again.");
        }
        const remaining = await transaction.shoppingItem.count({ where: { shoppingListId: list.id, inventoryAppliedAt: null, purchaseId: null } });
        // Everything ordered: the next add starts a fresh cart.
        if (remaining === 0) await transaction.shoppingList.update({ where: { id: list.id }, data: { status: LIST_STATUS.COMPLETED, activeFamilyId: null } });
        return transaction.purchase.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
      });
      return order;
    } catch (error) {
      // The order was not saved: take the "Đang giao" rows back out of Kho.
      await inventory(`/deliveries/${orderId}/cancel`, { familyId }).catch(() => undefined);
      throw error;
    }
  }

  /** The family's orders, newest first (all statuses). */
  static async list(familyId: string, options: { page?: number; limit?: number } = {}) {
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const page = Math.max(1, options.page ?? 1);
    const where = { familyId, buyerUserId: { not: null } };
    const [rows, total] = await Promise.all([
      prisma.purchase.findMany({ where, orderBy: { purchasedAt: "desc" }, skip: (page - 1) * limit, take: limit, include: ORDER_INCLUDE }),
      prisma.purchase.count({ where }),
    ]);
    // The shipper's name and phone once the order is on its way (and afterwards).
    const withShipper = rows.filter((order) => order.shipperId && ["SHIPPING", "DELIVERED", "FAILED"].includes(order.status));
    const profiles = await shipperProfiles(withShipper.map((order) => order.shipperId as string));
    const items = rows.map(({ shipperId, ...order }) => {
      const profile = shipperId && withShipper.some((entry) => entry.id === order.id) ? profiles.get(shipperId) : undefined;
      return { ...order, shipper: profile ? { name: profile.name, phone: profile.phone } : null };
    });
    return { items, page, limit, total };
  }

  /** The caller's last delivery details (prefill for the next order); null before their first order. */
  static async lastDelivery(familyId: string, userId: string) {
    const last = await prisma.purchase.findFirst({
      where: { familyId, buyerUserId: userId, deliveryAddress: { not: null } },
      orderBy: { purchasedAt: "desc" },
      select: { deliveryAddress: true, latitude: true, longitude: true, receiverName: true, receiverPhone: true },
    });
    return last ? { address: last.deliveryAddress, latitude: last.latitude, longitude: last.longitude, receiverName: last.receiverName, receiverPhone: last.receiverPhone } : null;
  }

  private static async orderOf(id: string, familyId?: string) {
    const order = await prisma.purchase.findFirst({ where: { id, ...(familyId ? { familyId } : {}) }, include: ORDER_INCLUDE });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    return order;
  }

  /** Customer: cancel while PENDING (idempotent: a cancelled order re-runs the Kho cleanup). */
  static async cancel(id: string, familyId: string) {
    const order = await this.orderOf(id, familyId);
    if (order.status !== "CANCELLED") {
      const changed = await prisma.purchase.updateMany({ where: { id, familyId, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_CANCELLABLE", "Only an order that has not been picked up can be cancelled.");
    }
    await inventory(`/deliveries/${id}/cancel`, { familyId });
    const cancelled = await this.orderOf(id, familyId);
    // Only on the change itself (a repeated cancel only re-runs the Kho cleanup).
    if (order.status !== "CANCELLED") await notifyBuyer(cancelled);
    return cancelled;
  }

  /**
   * Shipper lists. available: PENDING orders, nearest first when the shipper's position is given (orders without a
   * position last), else oldest first. mine: the caller's SHIPPING orders, oldest first. history: the caller's
   * DELIVERED / FAILED orders of the last 30 days, newest first.
   */
  static async shipperList(shipperId: string, scope: ShipperScope, origin?: { latitude: number; longitude: number } | null) {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    const where = scope === "available" ? { status: "PENDING" as const, buyerUserId: { not: null } }
      : scope === "mine" ? { status: "SHIPPING" as const, shipperId }
        : { shipperId, OR: [{ status: "DELIVERED" as const, deliveredAt: { gte: since } }, { status: "FAILED" as const, failedAt: { gte: since } }] };
    const orders = await prisma.purchase.findMany({ where, orderBy: { purchasedAt: scope === "history" ? "desc" : "asc" }, take: 100, include: SHIPPER_ITEMS });
    const views = orders.map((order) => shipperOrderView(order, origin));
    if (scope === "history") return views.sort((left, right) => (right.deliveredAt ?? right.failedAt ?? "").localeCompare(left.deliveredAt ?? left.failedAt ?? ""));
    if (scope === "available" && origin) return views.sort((left, right) => (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY) || left.orderedAt.localeCompare(right.orderedAt));
    return views;
  }

  /** Shipper: one order (a waiting one, or one of the caller's). Another shipper's order is 404. */
  static async shipperDetail(id: string, shipperId: string, origin?: { latitude: number; longitude: number } | null) {
    const order = await prisma.purchase.findFirst({ where: { id, buyerUserId: { not: null }, OR: [{ status: "PENDING" }, { shipperId }] }, include: SHIPPER_ITEMS });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    return shipperOrderView(order, origin);
  }

  /** A disabled shipper's orders being delivered go back to waiting (no shipper), for another shipper to take. */
  static async releaseShipper(shipperId: string): Promise<number> {
    const released = await prisma.purchase.updateMany({ where: { shipperId, status: "SHIPPING" }, data: { status: "PENDING", shipperId: null, shippingAt: null } });
    return released.count;
  }

  /** Delivered orders per shipper (admin list). */
  static async shipperStats(ids: string[]): Promise<Array<{ shipperId: string; delivered: number }>> {
    if (ids.length === 0) return [];
    const rows = await prisma.purchase.groupBy({ by: ["shipperId"], where: { shipperId: { in: ids }, status: "DELIVERED" }, _count: { _all: true } });
    return rows.flatMap((row) => (row.shipperId ? [{ shipperId: row.shipperId, delivered: row._count._all }] : []));
  }

  /** Shipper: take a PENDING order (→ SHIPPING, assigned to the caller). Repeating it is a no-op for the same shipper. */
  static async accept(id: string, shipperId: string) {
    const order = await this.orderOf(id);
    if (order.status === "SHIPPING" && order.shipperId === shipperId) return this.shipperView(id);
    const changed = await prisma.purchase.updateMany({ where: { id, status: "PENDING" }, data: { status: "SHIPPING", shipperId, shippingAt: new Date() } });
    if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_AVAILABLE", "Đơn đã có người nhận.");
    const view = await this.orderOf(id);
    await notifyBuyer(view);
    return this.shipperView(id);
  }

  /**
   * Shipper who accepted it: delivered (→ DELIVERED). The lines become normal Kho rows (expiry = delivery day in
   * Vietnam + shelf life; merged by the purchase rules) and are marked bought. Repeating it re-runs the Kho step.
   */
  static async deliver(id: string, shipperId: string) {
    let order = await this.orderOf(id);
    if (order.shipperId !== shipperId) throw new AppError(403, "NOT_YOUR_ORDER", "This order is assigned to another shipper.");
    if (order.status !== "DELIVERED") {
      const changed = await prisma.purchase.updateMany({ where: { id, status: "SHIPPING", shipperId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
      if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_SHIPPING", "Only an order being delivered can be marked delivered.");
      order = await this.orderOf(id);
    }
    const deliveredAt = order.deliveredAt ?? new Date();
    await inventory(`/deliveries/${id}/deliver`, {
      familyId: order.familyId, createdByUserId: order.buyerUserId ?? shipperId,
      lines: order.items.map((line) => ({ ...inventoryLine(line), ...(typeof line.shelfLifeDays === "number" ? { expiryDate: vnDayPlus(deliveredAt, line.shelfLifeDays) } : {}) })),
    });
    // The lines are bought now (Kho has them): same bookkeeping as a purchase (history for suggestions).
    await prisma.$transaction(async (transaction) => {
      for (const line of order.items) {
        await transaction.shoppingItem.updateMany({ where: { id: line.id, inventoryAppliedAt: null }, data: { isPurchased: true, inventoryAppliedAt: deliveredAt } });
        await transaction.purchaseHistory.upsert({
          where: { shoppingItemId: line.id },
          create: { familyId: order.familyId, itemKey: normalizedName(line.name), name: line.name, unit: line.unit, quantity: line.quantity, shoppingItemId: line.id, purchasedAt: deliveredAt },
          update: {},
        });
      }
    });
    await notifyBuyer(order);
    return this.shipperView(id);
  }

  /** Shipper who accepted it: could not deliver (→ FAILED, reason); Kho's "Đang giao" rows are removed. */
  static async fail(id: string, shipperId: string, reason: string) {
    const order = await this.orderOf(id);
    if (order.shipperId !== shipperId) throw new AppError(403, "NOT_YOUR_ORDER", "This order is assigned to another shipper.");
    if (order.status !== "FAILED") {
      const changed = await prisma.purchase.updateMany({ where: { id, status: "SHIPPING", shipperId }, data: { status: "FAILED", failedAt: new Date(), failReason: reason } });
      if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_SHIPPING", "Only an order being delivered can be marked failed.");
    }
    await inventory(`/deliveries/${id}/cancel`, { familyId: order.familyId });
    await notifyBuyer(await this.orderOf(id));
    return this.shipperView(id);
  }

  /** The order as the shipper sees it after an action (same shape as the shipper list / detail). */
  private static async shipperView(id: string) {
    const order = await prisma.purchase.findFirst({ where: { id }, include: SHIPPER_ITEMS });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    return { ...shipperOrderView(order), shipperId: order.shipperId };
  }
}
