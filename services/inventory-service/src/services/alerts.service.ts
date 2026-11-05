import { prisma } from "../lib/prisma";
import { ExpiringQuery } from "../validators/alerts.validator";
import type { Prisma } from "../../node_modules/.prisma/client-inventory";

export class AlertsService {
  static async getExpiringItems(query: ExpiringQuery) {
    const { days, familyId } = query;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const threshold = new Date(today);
    threshold.setUTCDate(threshold.getUTCDate() + days);
    threshold.setUTCHours(23, 59, 59, 999);

    const where: any = {
      deletedAt: null,
      quantity: { gt: 0 },
      expiryDate: {
        not: null,
        lte: threshold,
      },
      status: { notIn: ["CONSUMED", "DISCARDED"] },
    };

    if (familyId) where.familyId = familyId;

    const items = await prisma.foodItem.findMany({
      where,
      orderBy: { expiryDate: "asc" },
      include: { category: true },
    });

    return items.map((item) => {
      const expiryDay = new Date(item.expiryDate!);
      expiryDay.setUTCHours(0, 0, 0, 0);
      const daysLeft = Math.round((expiryDay.getTime() - today.getTime()) / 86_400_000);
      return { ...item, daysLeft };
    });
  }

  static async updateExpiringStatus(query: ExpiringQuery, userId?: string) {
    const { days, familyId } = query;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const threshold = new Date(today);
    threshold.setUTCDate(threshold.getUTCDate() + days);
    threshold.setUTCHours(23, 59, 59, 999);
    const baseWhere: Prisma.FoodItemWhereInput = {
      deletedAt: null,
      quantity: { gt: 0 },
      status: { notIn: ["CONSUMED", "DISCARDED"] },
      ...(familyId ? { familyId } : {}),
    };
    return prisma.$transaction(async (transaction) => {
      const items = await transaction.foodItem.findMany({
        where: {
          ...baseWhere,
          OR: [
            { expiryDate: { not: null, lte: threshold } },
            { status: { in: ["NEAR_EXPIRY", "EXPIRED"] } },
          ],
        },
        select: { id: true, quantity: true, unit: true, status: true, expiryDate: true },
      });

      let updatedCount = 0;
      for (const item of items) {
        let nextStatus: "FRESH" | "NEAR_EXPIRY" | "EXPIRED" = "FRESH";
        if (item.expiryDate) {
          const expiryDay = new Date(item.expiryDate);
          expiryDay.setUTCHours(0, 0, 0, 0);
          nextStatus = expiryDay < today ? "EXPIRED" : expiryDay <= threshold ? "NEAR_EXPIRY" : "FRESH";
        }
        if (item.status === nextStatus) continue;

        const result = await transaction.foodItem.updateMany({
          where: {
            id: item.id,
            deletedAt: null,
            quantity: { gt: 0 },
            status: item.status,
            ...(familyId ? { familyId } : {}),
          },
          data: { status: nextStatus },
        });
        if (result.count !== 1) continue;
        await transaction.inventoryLog.create({
          data: {
            itemId: item.id,
            action: "EXPIRY_STATUS_UPDATE",
            oldValue: { quantity: item.quantity, unit: item.unit, status: item.status },
            newValue: { quantity: item.quantity, unit: item.unit, status: nextStatus },
            note: "Expiry status refreshed from expiry date",
            createdBy: userId,
          },
        });
        updatedCount += 1;
      }
      return updatedCount;
    });
  }
}
