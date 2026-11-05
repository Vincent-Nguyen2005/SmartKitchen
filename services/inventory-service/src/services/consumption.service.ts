import { prisma } from "../lib/prisma";

type InventoryLogValue = { quantity?: unknown; unit?: unknown } | null;
type ConsumptionLog = {
  id: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date;
  item: { name: string; unit: string };
};

const valueFrom = (value: unknown): { quantity: number; unit?: string } | null => {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as InventoryLogValue;
  if (!entry) return null;
  const quantity = entry.quantity;
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return null;
  return { quantity, unit: typeof entry.unit === "string" ? entry.unit : undefined };
};

export class ConsumptionService {
  static async getEvents(familyId: string, days: number, cursor?: string, limit = 250) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const logs = await prisma.inventoryLog.findMany({
      where: {
        action: "CONSUMPTION",
        createdAt: { gte: since },
        item: { familyId, deletedAt: null },
      },
      select: {
        id: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        item: { select: { name: true, unit: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as ConsumptionLog[];

    const hasMore = logs.length > limit;
    const pageLogs = hasMore ? logs.slice(0, limit) : logs;
    const events = pageLogs.flatMap((log) => {
      const oldValue = valueFrom(log.oldValue);
      const newValue = valueFrom(log.newValue);
      if (!oldValue || !newValue || oldValue.quantity <= newValue.quantity) return [];
      return [{
        name: log.item.name,
        unit: oldValue.unit ?? log.item.unit,
        quantity: oldValue.quantity - newValue.quantity,
        consumedAt: log.createdAt,
      }];
    });

    return {
      events,
      pagination: {
        hasMore,
        nextCursor: hasMore ? pageLogs[pageLogs.length - 1]?.id ?? null : null,
      },
    };
  }
}
