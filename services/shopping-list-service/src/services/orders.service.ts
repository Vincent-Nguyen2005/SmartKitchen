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
    const [items, total] = await Promise.all([
      prisma.purchase.findMany({ where, orderBy: { purchasedAt: "desc" }, skip: (page - 1) * limit, take: limit, include: ORDER_INCLUDE }),
      prisma.purchase.count({ where }),
    ]);
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
    return this.orderOf(id, familyId);
  }

  /** Shipper: orders waiting for a shipper (PENDING), oldest first, or the caller's own deliveries (SHIPPING). */
  static async shipperList(shipperId: string, scope: "available" | "mine") {
    const orders = await prisma.purchase.findMany({
      where: scope === "available" ? { status: "PENDING", buyerUserId: { not: null } } : { status: "SHIPPING", shipperId },
      orderBy: { purchasedAt: "asc" },
      take: 100,
      include: { items: { orderBy: { createdAt: "asc" }, select: { name: true, quantity: true, unit: true, unitLabel: true } } },
    });
    // Delivery data only: no family, buyer or prices beyond the amount to collect.
    return orders.map((order) => ({
      id: order.id, status: order.status, orderedAt: order.purchasedAt.toISOString(), shippingAt: order.shippingAt?.toISOString() ?? null,
      deliveryAddress: order.deliveryAddress, latitude: order.latitude, longitude: order.longitude,
      receiverName: order.receiverName, receiverPhone: order.receiverPhone, note: order.note,
      paymentMethod: order.paymentMethod, codAmount: order.codAmount, itemCount: order.itemCount,
      items: order.items,
    }));
  }

  /** Shipper: take a PENDING order (→ SHIPPING, assigned to the caller). Repeating it is a no-op for the same shipper. */
  static async accept(id: string, shipperId: string) {
    const order = await this.orderOf(id);
    if (order.status === "SHIPPING" && order.shipperId === shipperId) return this.shipperView(id);
    const changed = await prisma.purchase.updateMany({ where: { id, status: "PENDING" }, data: { status: "SHIPPING", shipperId, shippingAt: new Date() } });
    if (changed.count !== 1) throw new AppError(409, "ORDER_NOT_AVAILABLE", "This order is no longer waiting for a shipper.");
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
    return this.shipperView(id);
  }

  private static async shipperView(id: string) {
    const order = await this.orderOf(id);
    return { id: order.id, status: order.status, shipperId: order.shipperId, shippingAt: order.shippingAt?.toISOString() ?? null, deliveredAt: order.deliveredAt?.toISOString() ?? null, failedAt: order.failedAt?.toISOString() ?? null, failReason: order.failReason, codAmount: order.codAmount };
  }
}
