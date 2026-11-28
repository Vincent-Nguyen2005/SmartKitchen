import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  foodItem: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  inventoryLog: { create: vi.fn() },
  cookApplication: { create: vi.fn() },
  category: { upsert: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn(), foodItem: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("./photo-storage.service", () => ({ PhotoStorage: { removeByUrl: vi.fn() }, managedPhotoFileName: () => null }));

import { ItemsService, lockedChanges } from "./items.service";
import { CookService, fefo, measureFor, planDeduction, type KhoRow } from "./cook.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const cookId = "44444444-4444-4444-8444-444444444444";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

beforeEach(() => {
  // The fixtures use fixed days: a fixed "today" (27/11/2026, Vietnam) keeps them before their expiry.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T03:00:00.000Z"));
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  tx.inventoryLog.create.mockResolvedValue({});
  tx.cookApplication.create.mockResolvedValue({});
  tx.foodItem.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => { vi.useRealTimers(); });

describe("Kho rows bought in Đi chợ are read-only", () => {
  const bought = { id: "i1", familyId, origin: "PURCHASE", name: "Thịt ba chỉ", unit: "KILOGRAM", quantity: 1.5, expiryDate: day("2026-12-01"), status: "FRESH", imageUrl: null };

  it("only the storage place may change on a bought row; values sent back unchanged are fine; manual rows are free", () => {
    expect(lockedChanges(bought, { name: "Thịt heo", quantity: 2, unit: "GRAM", expiryDate: day("2026-12-09"), status: "DISCARDED", imageUrl: "https://x/y.jpg" })).toEqual(["name", "quantity", "unit", "expiryDate", "status", "imageUrl"]);
    expect(lockedChanges(bought, { name: "Thịt ba chỉ", quantity: 1.5, unit: "KILOGRAM", expiryDate: day("2026-12-01"), storageLocation: "FREEZER" })).toEqual([]);
    expect(lockedChanges(bought, { categoryName: "Thịt" })).toEqual(["categoryName"]);
    expect(lockedChanges({ ...bought, origin: "MANUAL" }, { name: "Thịt heo", quantity: 2, status: "DISCARDED" })).toEqual([]);
  });

  it("the server refuses a locked change with 409 PURCHASED_ITEM_LOCKED and saves nothing", async () => {
    tx.foodItem.findFirst.mockResolvedValue(bought);
    await expect(ItemsService.update("i1", familyId, { quantity: 0.5 }, userId)).rejects.toMatchObject({ statusCode: 409, code: "PURCHASED_ITEM_LOCKED" });
    await expect(ItemsService.update("i1", familyId, { expiryDate: null }, userId)).rejects.toMatchObject({ code: "PURCHASED_ITEM_LOCKED" });
    expect(tx.foodItem.update).not.toHaveBeenCalled();
  });

  it("allows the storage place on a bought row, refuses discarding or deleting it, and leaves manual rows free", async () => {
    tx.foodItem.findFirst.mockResolvedValue(bought);
    tx.foodItem.update.mockImplementation(async ({ data }: { data: object }) => ({ ...bought, ...data }));
    await ItemsService.update("i1", familyId, { storageLocation: "FREEZER" }, userId);
    await expect(ItemsService.update("i1", familyId, { status: "DISCARDED" }, userId)).rejects.toMatchObject({ code: "PURCHASED_ITEM_LOCKED" });
    tx.foodItem.findFirst.mockResolvedValue({ ...bought, origin: "MANUAL" });
    await ItemsService.update("i1", familyId, { quantity: 0.5, name: "Thịt heo", status: "DISCARDED" }, userId);
    expect(tx.foodItem.update).toHaveBeenCalledTimes(2);
  });

  it("delete is refused for a bought row (409), allowed for a manual one", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue({ ...bought, logs: [] });
    await expect(ItemsService.softDelete("i1", familyId)).rejects.toMatchObject({ statusCode: 409, code: "PURCHASED_ITEM_LOCKED" });
    prismaMock.foodItem.findFirst.mockResolvedValue({ ...bought, origin: "MANUAL", logs: [] });
    prismaMock.foodItem.update.mockResolvedValue({ ...bought, deletedAt: new Date() });
    await ItemsService.softDelete("i1", familyId);
    expect(prismaMock.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
  });

  it("'Cộng thêm' on a bought row adds the quantity; the row stays PURCHASE-locked and keeps the merge expiry rule", async () => {
    const fresh = { ...bought, quantity: 1.5, expiryDate: day("2026-12-01") };
    tx.foodItem.findFirst
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce({ ...fresh, quantity: 2.5, category: null });
    const merged = await ItemsService.addQuantity("i1", familyId, { quantity: 1, unit: "KILOGRAM", expiryDate: day("2026-12-09") }, userId);
    expect(merged).toMatchObject({ quantity: 2.5, origin: "PURCHASE" });
    const update = tx.foodItem.updateMany.mock.calls[0][0];
    // Only the quantity grows: no origin change, and a later expiry never replaces the earlier one.
    expect(update.data).toEqual({ quantity: { increment: 1 } });
    expect(update.where).toMatchObject({ id: "i1", familyId, unit: "KILOGRAM", status: "FRESH" });
    expect(tx.inventoryLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "MANUAL_MERGE" }) }));
    // Still locked afterwards: a hand edit of the quantity is refused.
    prismaMock.foodItem.findFirst.mockResolvedValue({ ...fresh, quantity: 2.5 });
    tx.foodItem.findFirst.mockResolvedValue({ ...fresh, quantity: 2.5 });
    await expect(ItemsService.update("i1", familyId, { quantity: 1 }, userId)).rejects.toMatchObject({ code: "PURCHASED_ITEM_LOCKED" });
  });

  it("the old manual 'Đã dùng' cannot change a bought row's quantity", async () => {
    tx.foodItem.findFirst.mockResolvedValue(bought);
    await expect(ItemsService.consume("i1", familyId, 0.5, userId)).rejects.toMatchObject({ code: "PURCHASED_ITEM_LOCKED" });
  });

  it("a manual quantity of 0 marks the row used up (it leaves the Kho list)", async () => {
    tx.foodItem.findFirst.mockResolvedValue({ ...bought, origin: "MANUAL" });
    tx.foodItem.update.mockImplementation(async ({ data }: { data: object }) => ({ ...bought, ...data }));
    await ItemsService.update("i1", familyId, { quantity: 0 }, userId);
    expect(tx.foodItem.update.mock.calls[0][0].data).toMatchObject({ quantity: 0, status: "CONSUMED" });
  });
});

const row = (id: string, overrides: Partial<KhoRow>): KhoRow => ({ id, name: "Thịt heo", productId: null, quantity: 1, unit: "KILOGRAM", status: "FRESH", expiryDate: null, createdAt: day("2026-11-01"), ...overrides });

describe("cooking deducts from Kho", () => {
  it("converts g with kg and ml with l; a pack / piece with a known weight converts through it (bottles in ml)", () => {
    expect(measureFor("KILOGRAM", null)).toEqual({ measure: "MASS", factor: 1000 });
    expect(measureFor("g", null)).toEqual({ measure: "MASS", factor: 1 });
    expect(measureFor("PACK", { unit: "PACK", packGrams: 100 })).toEqual({ measure: "MASS", factor: 100 });
    expect(measureFor("PIECE", { unit: "PIECE", packGrams: 55 })).toEqual({ measure: "MASS", factor: 55 });
    expect(measureFor("BOTTLE", { unit: "BOTTLE", packGrams: 500 })).toEqual({ measure: "VOLUME", factor: 500 });
    expect(measureFor("PIECE", null)).toEqual({ measure: "PIECE", factor: 1 });
  });

  it("uses the rows that expire first (FEFO), rows without expiry last; 300 g from 0.2 kg + 0.5 kg", () => {
    const rows = [
      row("late", { quantity: 0.5, expiryDate: day("2026-12-05") }),
      row("none", { quantity: 1, expiryDate: null }),
      row("soon", { quantity: 0.2, expiryDate: day("2026-11-28") }),
    ];
    expect([...rows].sort(fefo).map((entry) => entry.id)).toEqual(["soon", "late", "none"]);
    const plan = planDeduction({ name: "Thịt heo", quantity: 300, unit: "GRAM" }, rows, null);
    expect(plan.changes.map((change) => [change.row.id, change.quantity])).toEqual([["soon", 0], ["late", 0.4]]);
    expect([plan.used, plan.missing]).toEqual([300, 0]);
  });

  it("packs and pieces: 150 g of Hành lá from 2 bó of 100 g; 3 eggs from 2 + 4 quả; the shortfall is reported", () => {
    const scallion = { id: "p-scallion", name: "Hành lá", englishName: null, unit: "PACK", packGrams: 100 };
    const pack = planDeduction({ name: "Hành lá", quantity: 150, unit: "GRAM" }, [row("bunch", { name: "Hành lá", unit: "PACK", quantity: 2, productId: "p-scallion" })], scallion);
    expect(pack.changes.map((change) => change.quantity)).toEqual([0.5]);
    const eggs = planDeduction({ name: "Trứng gà", quantity: 3, unit: "PIECE" }, [row("a", { name: "Trứng gà", unit: "PIECE", quantity: 2, expiryDate: day("2026-11-30") }), row("b", { name: "Trứng gà", unit: "PIECE", quantity: 4, expiryDate: day("2026-12-10") })], null);
    expect(eggs.changes.map((change) => [change.row.id, change.quantity])).toEqual([["a", 0], ["b", 3]]);
    const short = planDeduction({ name: "Thịt heo", quantity: 2, unit: "KILOGRAM" }, [row("only", { quantity: 0.5 })], null);
    expect([short.used, short.missing]).toEqual([0.5, 1.5]);
  });

  it("never takes expired, used-up or other-measure rows, nor other products", () => {
    const plan = planDeduction({ name: "Thịt heo", quantity: 500, unit: "GRAM" }, [
      row("expired", { status: "EXPIRED" }), row("used", { status: "CONSUMED", quantity: 0 }), row("pieces", { unit: "PIECE" }), row("beef", { name: "Thịt bò" }),
    ], null);
    expect(plan.changes).toEqual([]);
    expect(plan.missing).toBe(500);
  });

  it("writes the new quantities, marks a row reaching 0 as CONSUMED, logs CONSUMPTION, and is a no-op on retry", async () => {
    tx.foodItem.findMany.mockResolvedValue([row("soon", { quantity: 0.2, expiryDate: day("2026-11-28") }), row("late", { quantity: 0.5, expiryDate: day("2026-12-05") })]);
    const result = await CookService.cook({ familyId, cookId, dishName: "Thịt kho", lines: [{ name: "Thịt heo", quantity: 300, unit: "GRAM" }] }, [], userId);
    expect(result.lines).toEqual([{ name: "Thịt heo", quantity: 300, unit: "GRAM", used: 300, missing: 0 }]);
    expect(tx.foodItem.updateMany.mock.calls.map((call) => [call[0].where.id, call[0].data])).toEqual([["soon", { quantity: 0, status: "CONSUMED" }], ["late", { quantity: 0.4, status: "FRESH" }]]);
    expect(tx.inventoryLog.create.mock.calls[0][0].data).toMatchObject({ action: "CONSUMPTION", oldValue: { quantity: 0.2 }, newValue: { quantity: 0, status: "CONSUMED" } });

    tx.cookApplication.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    tx.foodItem.updateMany.mockClear();
    expect(await CookService.cook({ familyId, cookId, lines: [{ name: "Thịt heo", quantity: 300, unit: "GRAM" }] }, [], userId)).toEqual({ alreadyApplied: true, lines: [] });
    expect(tx.foodItem.updateMany).not.toHaveBeenCalled();
  });
});
