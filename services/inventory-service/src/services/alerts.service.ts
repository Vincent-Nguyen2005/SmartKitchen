import { prisma } from "../lib/prisma";
import { ExpiringQuery } from "../validators/alerts.validator";

export class AlertsService {
  static async getExpiringItems(query: ExpiringQuery) {
    const { days, familyId } = query;
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    const where: any = {
      deletedAt: null,
      expiryDate: {
        not: null,
        gte: now,
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
      const daysLeft = Math.ceil(
        (item.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return { ...item, daysLeft };
    });
  }

  static async updateExpiringStatus(query: ExpiringQuery) {
    const { days, familyId } = query;
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);

    const where: any = {
      deletedAt: null,
      status: { notIn: ["CONSUMED", "DISCARDED", "EXPIRED"] },
      expiryDate: { not: null, lte: threshold },
    };

    if (familyId) where.familyId = familyId;

    const result = await prisma.foodItem.updateMany({
      where,
      data: { status: "NEAR_EXPIRY" },
    });

    return result.count;
  }
}
