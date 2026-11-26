import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    shoppingList: { findFirst: vi.fn(), update: vi.fn() },
    shoppingItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  axios: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import { ShoppingListService, vnDayFromToday } from "./shopping-list.service";
import { addItemBodySchema, ensureItemsBodySchema } from "../validators/shopping-list.validator";

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

describe("Cần mua tuần này: Thêm vào Giỏ hàng (at least, idempotent)", () => {
  it("raises an existing line to at least the missing amount, never doubles it; a bigger cart line stays as it is; new products are added", async () => {
    // A tiny in-memory cart so running the same request twice can be checked.
    const cart = [item({ id: "egg", name: "Trứng gà", unit: "PIECE", quantity: 2, productId: "p-egg" }), item({ id: "pork", name: "Thịt heo", unit: "KILOGRAM", quantity: 3, productId: "p-pork" })];
    tx.shoppingItem.findMany.mockImplementation(async ({ where }: { where: { unit: string } }) => cart.filter((line) => line.unit === where.unit));
    tx.shoppingItem.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: { quantity: number } }) => { const line = cart.find((entry) => entry.id === where.id)!; Object.assign(line, data); return line; });
    tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { const line = item({ id: `new-${cart.length}`, ...data }); cart.push(line); return line; });
    const wanted = [
      { name: "Trứng gà", quantity: 5, unit: "PIECE", productId: "p-egg" },
      { name: "Thịt heo", quantity: 1, unit: "KILOGRAM", productId: "p-pork" },
      { name: "Cà rốt", quantity: 1, unit: "KILOGRAM", productId: "p-carrot", unitPrice: 25000 },
    ];
    await ShoppingListService.ensureItems(familyId, wanted);
    await ShoppingListService.ensureItems(familyId, wanted);
    expect(cart.map((line) => [line.name, line.quantity])).toEqual([["Trứng gà", 5], ["Thịt heo", 3], ["Cà rốt", 1]]);
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

  it("sends the market product id to Kho so the item can show the product image; lines without one send none", async () => {
    mocks.prisma.shoppingItem.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === fishId ? item({ id: fishId, name: "Cá thu", productId: "prod-fish" }) : item());
    mocks.prisma.shoppingItem.findMany.mockResolvedValueOnce([item(), item({ id: fishId, name: "Cá thu", productId: "prod-fish" })]).mockResolvedValueOnce([]);
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } });
    await ShoppingListService.checkout(familyId, userId, []);
    expect(mocks.axios.post.mock.calls[0][1]).not.toHaveProperty("productId");
    expect(mocks.axios.post.mock.calls[1][1]).toMatchObject({ name: "Cá thu", productId: "prod-fish" });
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
    // "Chi tiêu": the purchase is recorded for the line that reached Kho only, by this member.
    expect(tx.shoppingItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [milkId] }, isPurchased: true }) }));
  });

  it("records one purchase by the buyer with the checkout's rounded total", async () => {
    mocks.prisma.shoppingItem.findMany.mockResolvedValueOnce([item({ unitPrice: 30000, discountPercent: 15, quantity: 1.5 })]).mockResolvedValueOnce([]);
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } });
    const purchaseCreate = vi.fn().mockResolvedValue({ id: "pur-1" });
    Object.assign(tx, { purchase: { create: purchaseCreate } });
    tx.shoppingItem.findMany.mockResolvedValueOnce([{ id: milkId, quantity: 1.5, unitPrice: 30000, discountPercent: 15, productId: null }]);
    await ShoppingListService.checkout(familyId, userId);
    expect(purchaseCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ familyId, buyerUserId: userId, total: 38250, itemCount: 1 }) });
  });

  it("expiry = purchase day (Vietnam) + the catalog product's shelf-life days, before the app's value", async () => {
    mocks.prisma.shoppingItem.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === fishId ? item({ id: fishId, name: "Cá thu", productId: "prod-fish" }) : item());
    mocks.prisma.shoppingItem.findMany.mockResolvedValueOnce([item(), item({ id: fishId, name: "Cá thu", productId: "prod-fish" })]).mockResolvedValueOnce([]);
    mocks.axios.get.mockResolvedValue({ data: { items: [{ id: "prod-fish", shelfLifeDays: 2 }], totalPages: 1 } });
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } });
    await ShoppingListService.checkout(familyId, userId, [{ id: fishId, shelfLifeDays: 5 }, { id: milkId, shelfLifeDays: 7 }]);
    expect(mocks.axios.get).toHaveBeenCalledWith(expect.stringContaining("/catalog/ingredients"), expect.objectContaining({ params: expect.objectContaining({ ids: "prod-fish" }), headers: { "x-user-id": userId } }));
    expect(mocks.axios.post.mock.calls[1][1]).toMatchObject({ name: "Cá thu", expiryDate: vnDayFromToday(2) });
    // No catalog product: the app's value.
    expect(mocks.axios.post.mock.calls[0][1]).toMatchObject({ expiryDate: vnDayFromToday(7) });
    expect(vnDayFromToday(2, new Date("2026-11-30T18:30:00Z"))).toBe("2026-12-03"); // 01:30 on 1/12 in Vietnam
  });

  it("does nothing without an active cart", async () => {
    mocks.prisma.shoppingList.findFirst.mockResolvedValue(null);
    await expect(ShoppingListService.checkout(familyId, userId)).resolves.toEqual({ purchased: [], failed: [], listCompleted: false });
    expect(mocks.axios.post).not.toHaveBeenCalled();
  });
});

describe("kg in 0.1 steps, catalog packs in whole units", () => {
  const body = (quantity: number, unit: string, productId: string | null = "p-1") => ({ familyId, name: "Thịt ba chỉ", quantity, unit, productId });

  it("accepts 0.1 .. 20 kg in 0.1 steps and rejects other kg amounts", () => {
    for (const quantity of [0.1, 0.3, 1.5, 2.7, 20]) expect(addItemBodySchema.safeParse(body(quantity, "KILOGRAM")).success, String(quantity)).toBe(true);
    for (const quantity of [0.05, 0.25, 1.55, 20.1, 25]) expect(addItemBodySchema.safeParse(body(quantity, "KILOGRAM")).success, String(quantity)).toBe(false);
  });

  it("keeps catalog count units whole; free-text lines and g / ml keep any positive amount", () => {
    expect(addItemBodySchema.safeParse(body(2, "PACK")).success).toBe(true);
    expect(addItemBodySchema.safeParse(body(1.5, "PACK")).success).toBe(false);
    expect(addItemBodySchema.safeParse(body(0.5, "PIECE", null)).success).toBe(true);
    expect(addItemBodySchema.safeParse(body(250, "GRAM")).success).toBe(true);
    expect(ensureItemsBodySchema.safeParse({ familyId, items: [{ name: "Hành lá", quantity: 1.5, unit: "PACK", productId: "p-2" }] }).success).toBe(false);
    expect(ensureItemsBodySchema.safeParse({ familyId, items: [{ name: "Thịt heo", quantity: 1.3, unit: "KILOGRAM", productId: "p-3" }] }).success).toBe(true);
  });

  it("stores a decimal kg line, adds to it on the 0.1 grid and caps a merged line at 20 kg", async () => {
    await ShoppingListService.addItem({ familyId, name: "Thịt ba chỉ", quantity: 1.5, unit: "KILOGRAM", unitPrice: 170000, productId: "p-1" });
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: 1.5, unit: "KILOGRAM", unitPrice: 170000 }) });
    tx.shoppingItem.findMany.mockResolvedValue([item({ id: "line-1", name: "Thịt ba chỉ", unit: "KILOGRAM", quantity: 0.2, productId: "p-1" })]);
    await ShoppingListService.addItem({ familyId, name: "Thịt ba chỉ", quantity: 0.1, unit: "KILOGRAM", productId: "p-1" });
    expect(tx.shoppingItem.update).toHaveBeenLastCalledWith({ where: { id: "line-1" }, data: { quantity: 0.3, productId: "p-1" } });
    tx.shoppingItem.findMany.mockResolvedValue([item({ id: "line-1", name: "Thịt ba chỉ", unit: "KILOGRAM", quantity: 19.5, productId: "p-1" })]);
    await ShoppingListService.addItem({ familyId, name: "Thịt ba chỉ", quantity: 2, unit: "KILOGRAM", productId: "p-1" });
    expect(tx.shoppingItem.update).toHaveBeenLastCalledWith({ where: { id: "line-1" }, data: { quantity: 20, productId: "p-1" } });
  });

  it("checks a quantity change against the line's own unit", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(item({ id: "line-1", unit: "KILOGRAM", productId: "p-1" }));
    mocks.prisma.shoppingItem.update.mockResolvedValue({});
    await expect(ShoppingListService.updateItem("line-1", familyId, { quantity: 0.35 })).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    await ShoppingListService.updateItem("line-1", familyId, { quantity: 0.4 });
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(item({ id: "line-2", unit: "PACK", productId: "p-2" }));
    await expect(ShoppingListService.updateItem("line-2", familyId, { quantity: 1.5 })).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
  });

  it("buys a decimal kg line: Kho receives 1.5 KILOGRAM", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(item({ id: fishId, name: "Thịt ba chỉ", unit: "KILOGRAM", quantity: 1.5, productId: "p-1" }));
    tx.shoppingItem.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => item({ id: where.id }));
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: "66666666-6666-4666-8666-666666666666" } } } });
    await ShoppingListService.confirmPurchase(fishId, familyId, userId);
    expect(mocks.axios.post.mock.calls[0][1]).toMatchObject({ name: "Thịt ba chỉ", quantity: 1.5, unit: "KILOGRAM" });
  });
});

describe("vnDayFromToday", () => {
  it("counts days in Vietnam time", () => {
    // 2026-11-20 18:00 UTC is already 2026-11-21 in Vietnam.
    expect(vnDayFromToday(3, new Date("2026-11-20T18:00:00.000Z"))).toBe("2026-11-24");
  });
});
