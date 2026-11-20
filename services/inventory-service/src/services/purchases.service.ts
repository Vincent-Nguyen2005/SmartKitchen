import { prisma } from "../lib/prisma";
import { Prisma } from "../../node_modules/.prisma/client-inventory";
import { ApplyPurchaseInput } from "../validators/purchase.validator";

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
        const previous = await transaction.foodItem.findFirst({
          where: {
            familyId: input.familyId,
            name: { equals: input.name, mode: "insensitive" },
            unit: input.unit,
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
        });
        const oldValue = previous ? { quantity: previous.quantity, status: previous.status } : null;
        const updated = previous
          ? await transaction.foodItem.update({
              where: { id: previous.id },
              data: {
                quantity: { increment: input.quantity },
                status: "FRESH",
                // A restock fills a missing expiry/group but never overwrites what the family already set.
                ...(expiryDate && !previous.expiryDate ? { expiryDate } : {}),
                ...(categoryId && !previous.categoryId ? { categoryId } : {}),
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
