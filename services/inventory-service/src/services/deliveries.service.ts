import { prisma } from "../lib/prisma";
import { resolveCategoryId } from "./items.service";
import { PurchasesService } from "./purchases.service";
import type { DeliveryLinesInput, DeliverInput } from "../validators/delivery.validator";

/**
 * Kho rows of an Đi chợ delivery order (shopping-list-service calls these internal endpoints):
 * - pending: one row per ordered line, origin PURCHASE with deliveryOrderId set ("Đang giao"). Never merged into
 *   other rows; read-only; ignored by cooking, the duplicate prompt, purchase merges and expiry alerts (NOT_PENDING).
 * - deliver: each line goes through the normal purchase path (PurchasesService.apply: idempotent per line, merges by
 *   the current purchase rules, expiry = delivery day + shelf life as computed by the caller), then its pending row
 *   is removed.
 * - cancel (cancelled / failed order): the pending rows are removed.
 * All three are idempotent.
 */
export const NOT_PENDING = { deliveryOrderId: null } as const;

export const isPendingDelivery = (row: { deliveryOrderId?: string | null }): boolean => Boolean(row.deliveryOrderId);

export class DeliveriesService {
  static async createPending(input: DeliveryLinesInput): Promise<{ created: number }> {
    const ids = input.lines.map((line) => line.externalPurchaseId);
    const [existing, applied] = await Promise.all([
      prisma.foodItem.findMany({ where: { pendingPurchaseId: { in: ids } }, select: { pendingPurchaseId: true } }),
      prisma.purchaseApplication.findMany({ where: { externalPurchaseId: { in: ids } }, select: { externalPurchaseId: true } }),
    ]);
    const skip = new Set([...existing.map((row) => row.pendingPurchaseId), ...applied.map((row) => row.externalPurchaseId)]);
    let created = 0;
    for (const line of input.lines) {
      if (skip.has(line.externalPurchaseId)) continue;
      const categoryId = await resolveCategoryId(prisma, line.categoryName);
      try {
        await prisma.foodItem.create({
          data: {
            familyId: input.familyId,
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            unitLabel: line.unit === "PIECE" ? line.unitLabel ?? null : null,
            storageLocation: "PANTRY",
            status: "FRESH",
            origin: "PURCHASE",
            deliveryOrderId: input.orderId,
            pendingPurchaseId: line.externalPurchaseId,
            ...(line.productId ? { productId: line.productId } : {}),
            ...(categoryId ? { categoryId } : {}),
          },
        });
        created += 1;
      } catch (error) {
        // A parallel retry created it first (unique pendingPurchaseId): fine.
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    return { created };
  }

  static async deliver(orderId: string, input: DeliverInput): Promise<{ applied: number; removed: number }> {
    let applied = 0;
    for (const line of input.lines) {
      const result = await PurchasesService.apply({
        externalPurchaseId: line.externalPurchaseId,
        familyId: input.familyId,
        createdByUserId: input.createdByUserId,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        ...(line.productId ? { productId: line.productId } : {}),
        ...(line.categoryName ? { categoryName: line.categoryName } : {}),
        ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      });
      if (!result.alreadyApplied) applied += 1;
    }
    const removed = await prisma.foodItem.deleteMany({ where: { deliveryOrderId: orderId, familyId: input.familyId } });
    return { applied, removed: removed.count };
  }

  static async cancel(orderId: string, familyId: string): Promise<{ removed: number }> {
    const removed = await prisma.foodItem.deleteMany({ where: { deliveryOrderId: orderId, familyId } });
    return { removed: removed.count };
  }
}
