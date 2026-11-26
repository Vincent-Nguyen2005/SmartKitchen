import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    foodItem: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    purchaseApplication: { findMany: vi.fn() },
    category: { upsert: vi.fn() },
    cookApplication: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  apply: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./purchases.service", () => ({ PurchasesService: { apply: mocks.apply } }));

import { DeliveriesService } from "./deliveries.service";
import { ItemsService } from "./items.service";
import { CookService } from "./cook.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const orderId = "44444444-4444-4444-8444-444444444444";
const userId = "33333333-3333-4333-8333-333333333333";
const lineA = "55555555-5555-4555-8555-555555555551";
const lineB = "55555555-5555-4555-8555-555555555552";
const line = (id: string, extra: Record<string, unknown> = {}) => ({ externalPurchaseId: id, name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM" as const, ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.category.upsert.mockResolvedValue({ id: "cat-1" });
  mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.prisma) => Promise<unknown>) => run(mocks.prisma));
});

describe("Kho rows while an order is being delivered", () => {
  it("creates one 'Đang giao' row per line, linked to the order; a retry creates nothing new", async () => {
    mocks.prisma.foodItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ pendingPurchaseId: lineA }]);
    mocks.prisma.purchaseApplication.findMany.mockResolvedValue([]);
    mocks.prisma.foodItem.create.mockResolvedValue({});
    expect(await DeliveriesService.createPending({ orderId, familyId, createdByUserId: userId, lines: [line(lineA, { categoryName: "Thịt" })] })).toEqual({ created: 1 });
    expect(mocks.prisma.foodItem.create.mock.calls[0][0].data).toMatchObject({
      familyId, name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", origin: "PURCHASE", status: "FRESH", deliveryOrderId: orderId, pendingPurchaseId: lineA, categoryId: "cat-1",
    });
    // No expiry while delivering.
    expect(mocks.prisma.foodItem.create.mock.calls[0][0].data).not.toHaveProperty("expiryDate");
    expect(await DeliveriesService.createPending({ orderId, familyId, createdByUserId: userId, lines: [line(lineA)] })).toEqual({ created: 0 });
    expect(mocks.prisma.foodItem.create).toHaveBeenCalledTimes(1);
  });

  it("delivered: each line goes through the normal purchase path with its expiry, then the pending rows go", async () => {
    mocks.apply.mockResolvedValueOnce({ alreadyApplied: false }).mockResolvedValueOnce({ alreadyApplied: true });
    mocks.prisma.foodItem.deleteMany.mockResolvedValue({ count: 2 });
    const result = await DeliveriesService.deliver(orderId, { familyId, createdByUserId: userId, lines: [line(lineA, { expiryDate: "2026-11-30" }), line(lineB, { productId: "p-1" })] });
    expect(result).toEqual({ applied: 1, removed: 2 });
    expect(mocks.apply.mock.calls[0][0]).toEqual({ externalPurchaseId: lineA, familyId, createdByUserId: userId, name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", expiryDate: "2026-11-30" });
    expect(mocks.apply.mock.calls[1][0]).toMatchObject({ externalPurchaseId: lineB, productId: "p-1" });
    expect(mocks.prisma.foodItem.deleteMany).toHaveBeenCalledWith({ where: { deliveryOrderId: orderId, familyId } });
  });

  it("cancelled or failed: the pending rows are removed (only this family's, only this order's)", async () => {
    mocks.prisma.foodItem.deleteMany.mockResolvedValue({ count: 3 });
    expect(await DeliveriesService.cancel(orderId, familyId)).toEqual({ removed: 3 });
    expect(mocks.prisma.foodItem.deleteMany).toHaveBeenCalledWith({ where: { deliveryOrderId: orderId, familyId } });
  });

  it("a pending row cannot be edited, used or deleted by the user (409 DELIVERY_PENDING)", async () => {
    const pending = { id: "row-1", familyId, origin: "PURCHASE", status: "FRESH", deliveryOrderId: orderId, unit: "KILOGRAM", quantity: 1, imageUrl: null };
    mocks.prisma.foodItem.findFirst.mockResolvedValue(pending);
    await expect(ItemsService.update("row-1", familyId, { storageLocation: "FRIDGE" } as never, userId)).rejects.toMatchObject({ statusCode: 409, code: "DELIVERY_PENDING" });
    await expect(ItemsService.consume("row-1", familyId, 1, userId)).rejects.toMatchObject({ code: "DELIVERY_PENDING" });
    await expect(ItemsService.addQuantity("row-1", familyId, { quantity: 1, unit: "KILOGRAM" }, userId)).rejects.toMatchObject({ code: "DELIVERY_PENDING" });
    await expect(ItemsService.softDelete("row-1", familyId)).rejects.toMatchObject({ code: "DELIVERY_PENDING" });
    expect(mocks.prisma.foodItem.update).not.toHaveBeenCalled();
  });

  it("cooking and the duplicate prompt never read pending rows", async () => {
    mocks.prisma.cookApplication.create.mockResolvedValue({});
    mocks.prisma.foodItem.findMany.mockResolvedValue([]);
    await CookService.cook({ familyId, cookId: "66666666-6666-4666-8666-666666666666", lines: [{ name: "Thịt heo", quantity: 0.5, unit: "KILOGRAM" }] }, [], userId);
    expect(mocks.prisma.foodItem.findMany.mock.calls[0][0].where).toMatchObject({ familyId, deliveryOrderId: null });
    await ItemsService.findDuplicate(familyId, { name: "Thịt heo", productId: null, unit: "KILOGRAM" });
    expect(mocks.prisma.foodItem.findMany.mock.calls[1][0].where).toMatchObject({ familyId, deliveryOrderId: null });
  });
});
