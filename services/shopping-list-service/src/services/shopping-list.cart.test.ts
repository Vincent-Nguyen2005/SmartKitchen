import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    shoppingList: { findFirst: vi.fn(), update: vi.fn() },
    shoppingItem: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  axios: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import { ShoppingListService, vnDayFromToday } from "./shopping-list.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const listId = "77777777-7777-4777-8777-777777777777";
const milkId = "55555555-5555-4555-8555-555555555551";
const fishId = "55555555-5555-4555-8555-555555555552";

const item = (overrides: Record<string, unknown> = {}) => ({
  id: milkId, shoppingListId: listId, name: "Sữa tươi", quantity: 2, unit: "BOX", isPurchased: false,
  inventoryAppliedAt: null, inventoryItemId: null, productId: null, unitPrice: null, discountPercent: null, imageUrl: null,
  shoppingList: { status: "ACTIVE" }, ...overrides,
});

const tx = {
  shoppingList: { findFirst: vi.fn(), create: vi.fn() },
  shoppingItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  purchaseHistory: { upsert: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  tx.shoppingList.findFirst.mockResolvedValue({ id: listId, familyId, status: "ACTIVE" });
  tx.shoppingItem.findMany.mockResolvedValue([]);
  tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", ...data }));
  tx.shoppingItem.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ ...item({ id: where.id }), ...data }));
  tx.purchaseHistory.upsert.mockResolvedValue({});
});

describe("Giỏ hàng: add with a price snapshot", () => {
  it("stores the market price snapshot on a new cart line", async () => {
    await ShoppingListService.addItem({ familyId, name: "Cà chua", quantity: 2, unit: "KILOGRAM", unitPrice: 25000, discountPercent: 10, productId: "p-1", imageUrl: "https://cdn.example.com/a.jpg" });
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shoppingListId: listId, name: "Cà chua", quantity: 2, unit: "KILOGRAM", unitPrice: 25000, discountPercent: 10, productId: "p-1", imageUrl: "https://cdn.example.com/a.jpg" }),
    });
  });

  it("raises the quantity of the same product and unit instead of adding a duplicate", async () => {
    tx.shoppingItem.findMany.mockResolvedValue([item({ id: "line-1", name: "Cà chua", unit: "KILOGRAM", quantity: 1.5, productId: "p-1" })]);
    await ShoppingListService.addItem({ familyId, name: "Cà chua", quantity: 2, unit: "KILOGRAM", unitPrice: 26000, productId: "p-1" });
    expect(tx.shoppingItem.create).not.toHaveBeenCalled();
    expect(tx.shoppingItem.update).toHaveBeenCalledWith({ where: { id: "line-1" }, data: { quantity: 3.5, unitPrice: 26000, productId: "p-1" } });
    expect(tx.shoppingItem.findMany).toHaveBeenCalledWith({ where: { shoppingListId: listId, unit: "KILOGRAM", isPurchased: false, inventoryAppliedAt: null } });
  });

  it("merges an older line without a product id by name", async () => {
    tx.shoppingItem.findMany.mockResolvedValue([item({ id: "old", name: "Sữa  tươi", unit: "BOX", quantity: 1 })]);
    await ShoppingListService.addItem({ familyId, name: "sữa tươi", quantity: 1, unit: "BOX" });
    expect(tx.shoppingItem.update).toHaveBeenCalledWith({ where: { id: "old" }, data: { quantity: 2 } });
  });
});

describe("Giỏ hàng: checkout into Kho", () => {
  beforeEach(() => {
    mocks.prisma.shoppingList.findFirst.mockResolvedValue({ id: listId, familyId, status: "ACTIVE" });
    mocks.prisma.shoppingItem.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === fishId ? item({ id: fishId, name: "Cá thu", unit: "KILOGRAM", quantity: 1 }) : item());
    tx.shoppingItem.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => item({ id: where.id }));
  });

  it("purchases every cart line with category and expiry, then completes the list", async () => {
    mocks.prisma.shoppingItem.findMany
      .mockResolvedValueOnce([item(), item({ id: fishId, name: "Cá thu" })])
      .mockResolvedValueOnce([]);
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } });

    const result = await ShoppingListService.checkout(familyId, userId, [{ id: fishId, categoryName: "Hải sản", shelfLifeDays: 2 }]);

    expect(result.purchased.map((line) => line.id)).toEqual([milkId, fishId]);
    expect(result.failed).toEqual([]);
    expect(result.listCompleted).toBe(true);
    expect(mocks.axios.post).toHaveBeenNthCalledWith(2,
      expect.stringContaining("/api/inventory/internal/purchases"),
      expect.objectContaining({ externalPurchaseId: fishId, name: "Cá thu", categoryName: "Hải sản", expiryDate: vnDayFromToday(2) }),
      expect.anything());
    expect(mocks.axios.post.mock.calls[0][1]).not.toHaveProperty("expiryDate");
    expect(mocks.prisma.shoppingList.update).toHaveBeenCalledWith({ where: { id: listId }, data: { status: "COMPLETED", activeFamilyId: null } });
  });

  it("keeps a failed line in the cart and reports it, without completing the list", async () => {
    mocks.prisma.shoppingItem.findMany.mockResolvedValueOnce([item(), item({ id: fishId, name: "Cá thu" })]);
    mocks.axios.post
      .mockResolvedValueOnce({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } })
      .mockRejectedValueOnce(new Error("inventory down"));

    const result = await ShoppingListService.checkout(familyId, userId);

    expect(result.purchased.map((line) => line.id)).toEqual([milkId]);
    expect(result.failed).toEqual([{ id: fishId, name: "Cá thu", code: "INVENTORY_SYNC_FAILED", message: expect.any(String) }]);
    expect(result.listCompleted).toBe(false);
    expect(mocks.prisma.shoppingList.update).not.toHaveBeenCalled();
    // Only the purchased line was marked; the failed one was never written.
    expect(tx.shoppingItem.update).toHaveBeenCalledTimes(1);
  });

  it("does nothing without an active cart", async () => {
    mocks.prisma.shoppingList.findFirst.mockResolvedValue(null);
    await expect(ShoppingListService.checkout(familyId, userId)).resolves.toEqual({ purchased: [], failed: [], listCompleted: false });
    expect(mocks.axios.post).not.toHaveBeenCalled();
  });
});

describe("vnDayFromToday", () => {
  it("counts days in Vietnam time", () => {
    // 2026-11-20 18:00 UTC is already 2026-11-21 in Vietnam.
    expect(vnDayFromToday(3, new Date("2026-11-20T18:00:00.000Z"))).toBe("2026-11-24");
  });
});
