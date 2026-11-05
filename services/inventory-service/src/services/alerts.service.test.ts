import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  foodItem: { findMany: vi.fn(), updateMany: vi.fn() },
  inventoryLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { AlertsService } from "./alerts.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";

const transaction = {
  foodItem: { findMany: vi.fn(), updateMany: vi.fn() },
  inventoryLog: { create: vi.fn() },
};

describe("AlertsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:30:00.000Z"));
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    transaction.foodItem.updateMany.mockResolvedValue({ count: 1 });
    transaction.inventoryLog.create.mockResolvedValue({ id: "log-1" });
  });

  afterEach(() => vi.useRealTimers());

  it("refreshes expired, near-expiry and restored-fresh statuses within the requested family", async () => {
    transaction.foodItem.findMany.mockResolvedValue([
      { id: "expired", quantity: 1, unit: "PIECE", status: "FRESH", expiryDate: new Date("2026-11-05T12:00:00.000Z") },
      { id: "near", quantity: 2, unit: "GRAM", status: "FRESH", expiryDate: new Date("2026-11-08T12:00:00.000Z") },
      { id: "fresh", quantity: 3, unit: "LITER", status: "EXPIRED", expiryDate: new Date("2026-11-20T12:00:00.000Z") },
      { id: "cleared", quantity: 4, unit: "BOX", status: "NEAR_EXPIRY", expiryDate: null },
      { id: "unchanged", quantity: 1, unit: "PIECE", status: "NEAR_EXPIRY", expiryDate: new Date("2026-11-08T12:00:00.000Z") },
    ]);

    await expect(AlertsService.updateExpiringStatus({ familyId, days: 3 }, userId)).resolves.toBe(4);

    const threshold = new Date("2026-11-09T23:59:59.999Z");
    expect(transaction.foodItem.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        quantity: { gt: 0 },
        status: { notIn: ["CONSUMED", "DISCARDED"] },
        familyId,
        OR: [
          { expiryDate: { not: null, lte: threshold } },
          { status: { in: ["NEAR_EXPIRY", "EXPIRED"] } },
        ],
      },
      select: { id: true, quantity: true, unit: true, status: true, expiryDate: true },
    });
    expect(transaction.foodItem.updateMany).toHaveBeenCalledTimes(4);
    expect(transaction.inventoryLog.create).toHaveBeenCalledTimes(4);
    expect(transaction.inventoryLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      itemId: "expired",
      action: "EXPIRY_STATUS_UPDATE",
      oldValue: { quantity: 1, unit: "PIECE", status: "FRESH" },
      newValue: { quantity: 1, unit: "PIECE", status: "EXPIRED" },
      createdBy: userId,
    }) });
  });

  it("includes expired items and reports signed UTC day offsets", async () => {
    prismaMock.foodItem.findMany.mockResolvedValue([
      { id: "expired", expiryDate: new Date("2026-11-04T19:00:00.000Z") },
      { id: "today", expiryDate: new Date("2026-11-06T00:00:00.000Z") },
    ]);

    const result = await AlertsService.getExpiringItems({ familyId, days: 3 });

    expect(result.map((item) => item.daysLeft)).toEqual([-2, 0]);
    expect(prismaMock.foodItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ familyId, expiryDate: { not: null, lte: new Date("2026-11-09T23:59:59.999Z") } }),
    }));
  });
});
