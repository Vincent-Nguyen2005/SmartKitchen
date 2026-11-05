import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ inventoryLog: { findMany: vi.fn() } }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { ConsumptionService } from "./consumption.service";

const familyId = "11111111-1111-4111-8111-111111111111";

describe("ConsumptionService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns only positive consumption deltas scoped to family and the requested window", async () => {
    const consumedAt = new Date("2026-11-05T08:00:00.000Z");
    prismaMock.inventoryLog.findMany.mockResolvedValue([
      { oldValue: { quantity: 4, unit: "GRAM" }, newValue: { quantity: 2.5, unit: "GRAM" }, createdAt: consumedAt, item: { name: "Gạo", unit: "KILOGRAM" } },
      { oldValue: { quantity: 2 }, newValue: { quantity: 2 }, createdAt: consumedAt, item: { name: "Muối", unit: "GRAM" } },
      { oldValue: { quantity: "bad" }, newValue: { quantity: 1 }, createdAt: consumedAt, item: { name: "Đường", unit: "GRAM" } },
    ]);

    await expect(ConsumptionService.getEvents(familyId, 30)).resolves.toEqual({
      events: [{ name: "Gạo", unit: "GRAM", quantity: 1.5, consumedAt }],
      pagination: { hasMore: false, nextCursor: null },
    });
    expect(prismaMock.inventoryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        action: "CONSUMPTION",
        createdAt: { gte: new Date("2026-10-07T12:00:00.000Z") },
        item: { familyId, deletedAt: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 251,
    }));
  });

  it("returns a stable cursor when more consumption logs remain", async () => {
    prismaMock.inventoryLog.findMany.mockResolvedValue([
      { id: "log-2", oldValue: { quantity: 2 }, newValue: { quantity: 1 }, createdAt: new Date(), item: { name: "Gạo", unit: "GRAM" } },
      { id: "log-1", oldValue: { quantity: 1 }, newValue: { quantity: 0 }, createdAt: new Date(), item: { name: "Gạo", unit: "GRAM" } },
      { id: "look-ahead", oldValue: { quantity: 1 }, newValue: { quantity: 0 }, createdAt: new Date(), item: { name: "Gạo", unit: "GRAM" } },
    ]);

    await expect(ConsumptionService.getEvents(familyId, 30, undefined, 2)).resolves.toMatchObject({
      events: [
        { quantity: 1, name: "Gạo" },
        { quantity: 1, name: "Gạo" },
      ],
      pagination: { hasMore: true, nextCursor: "log-1" },
    });
    expect(prismaMock.inventoryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });
});
