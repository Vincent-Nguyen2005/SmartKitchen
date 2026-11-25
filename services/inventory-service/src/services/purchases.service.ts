import { prisma } from "../lib/prisma";
import { Prisma, type Unit } from "../../node_modules/.prisma/client-inventory";
import { ApplyPurchaseInput } from "../validators/purchase.validator";

/** Units of the same kind and their size in the smaller one: a purchase in kg joins a Kho row in g (and l / ml). */
const SAME_KIND: Record<string, Record<string, number>> = {
  GRAM: { GRAM: 1, KILOGRAM: 1000 },
  KILOGRAM: { KILOGRAM: 1, GRAM: 0.001 },
  MILLILITER: { MILLILITER: 1, LITER: 1000 },
  LITER: { LITER: 1, MILLILITER: 0.001 },
};
/** `quantity` of `from` expressed in `to` (3 decimals), or null when the units are not of the same kind. */
export const convertQuantity = (quantity: number, from: string, to: string): number | null => {
  if (from === to) return quantity;
  const factor = SAME_KIND[to]?.[from];
  return factor === undefined ? null : Math.round(quantity * factor * 1000) / 1000;
};

const isUniqueConflict = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

export class PurchasesService {
  private static async findApplied(externalPurchaseId: string, familyId: string) {
    const application = await prisma.purchaseApplication.findUnique({ where: { externalPurchaseId } });
    if (!application) return null;
    if (application.familyId !== familyId) {
      throw Object.assign(new Error("Purchase id is already bound to a different family."), {
        statusCode: 409,
        code: "PURCHASE_FAMILY_MISMATCH",
      });
    }
    const item = await prisma.foodItem.findUnique({
      where: { id: application.itemId },
      include: { category: true },
    });
    return { item, alreadyApplied: true };
  }

  static async apply(input: ApplyPurchaseInput) {
    const existing = await this.findApplied(input.externalPurchaseId, input.familyId);
    if (existing) return { item: existing.item, alreadyApplied: true };

    try {
      const item = await prisma.$transaction(async (transaction) => {
        const categoryId = input.categoryName
          ? (await transaction.category.upsert({ where: { name: input.categoryName }, create: { name: input.categoryName }, update: {}, select: { id: true } })).id
          : undefined;
        const expiryDate = input.expiryDate ? new Date(`${input.expiryDate}T00:00:00.000Z`) : undefined;
        // The same product already in Kho: same unit first, else a unit of the same kind (1.5 kg bought joins
        // "500 g" as 2000 g). Packs, pieces and other kinds never convert (a new row is created).
        const sameKind = Object.keys(SAME_KIND[input.unit] ?? { [input.unit]: 1 }) as Unit[];
        const candidates = await transaction.foodItem.findMany({
          where: {
            familyId: input.familyId,
            name: { equals: input.name, mode: "insensitive" },
            unit: { in: sameKind },
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
        });
        const previous = candidates.find((row) => row.unit === input.unit) ?? candidates[0] ?? null;
        const added = previous ? convertQuantity(input.quantity, input.unit, previous.unit) ?? input.quantity : input.quantity;
        const oldValue = previous ? { quantity: previous.quantity, status: previous.status } : null;
        const updated = previous
          ? await transaction.foodItem.update({
              where: { id: previous.id },
              data: {
                quantity: { increment: added },
                status: "FRESH",
                // A restock fills a missing expiry/group but never overwrites what the family already set.
                ...(expiryDate && !previous.expiryDate ? { expiryDate } : {}),
                ...(categoryId && !previous.categoryId ? { categoryId } : {}),
                ...(input.productId && !previous.productId ? { productId: input.productId } : {}),
              },
              include: { category: true },
            })
          : await transaction.foodItem.create({
              data: {
                familyId: input.familyId,
                name: input.name,
                quantity: input.quantity,
                unit: input.unit,
                storageLocation: "PANTRY",
                status: "FRESH",
                ...(expiryDate ? { expiryDate } : {}),
                ...(categoryId ? { categoryId } : {}),
                ...(input.productId ? { productId: input.productId } : {}),
              },
              include: { category: true },
            });
        await transaction.inventoryLog.create({
          data: {
            itemId: updated.id,
            action: previous ? "PURCHASE_RESTOCK" : "PURCHASE_ADD",
            externalRef: input.externalPurchaseId,
            oldValue: oldValue ?? Prisma.DbNull,
            newValue: { quantity: updated.quantity, status: updated.status },
            note: `Confirmed shopping item ${input.externalPurchaseId}`,
            createdBy: input.createdByUserId,
          },
        });
        await transaction.purchaseApplication.create({
          data: {
            externalPurchaseId: input.externalPurchaseId,
            familyId: input.familyId,
            itemId: updated.id,
          },
        });
        return updated;
      });
      return { item, alreadyApplied: false };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const applied = await this.findApplied(input.externalPurchaseId, input.familyId);
      if (applied) return { item: applied.item, alreadyApplied: true };
      throw error;
    }
  }
}
