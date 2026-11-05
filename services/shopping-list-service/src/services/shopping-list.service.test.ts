import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    shoppingList: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    shoppingItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    purchaseHistory: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  axios: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("axios", () => ({ default: mocks.axios }));

import { ShoppingListService } from "./shopping-list.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const itemId = "55555555-5555-4555-8555-555555555555";
const userId = "33333333-3333-4333-8333-333333333333";
const inventoryItemId = "66666666-6666-4666-8666-666666666666";

const shoppingItem = (overrides: Record<string, unknown> = {}) => ({
  id: itemId,
  shoppingListId: "77777777-7777-4777-8777-777777777777",
  name: "Sữa tươi",
  quantity: 2,
  unit: "BOX",
  isPurchased: false,
  inventoryAppliedAt: null,
  inventoryItemId: null,
  shoppingList: { status: "ACTIVE" },
  ...overrides,
});

describe("ShoppingListService", () => {
  const tx = {
    shoppingList: { findFirst: vi.fn(), create: vi.fn() },
    shoppingItem: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    purchaseHistory: { upsert: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.shoppingList.findFirst.mockResolvedValue(null);
    tx.shoppingList.create.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: itemId, ...data }));
    tx.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
    tx.shoppingItem.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...shoppingItem(), ...data }));
    tx.purchaseHistory.upsert.mockResolvedValue({ shoppingItemId: itemId });
  });

  it("stores a reference item without calling inventory", async () => {
    const result = await ShoppingListService.addItem({ familyId, name: "Sữa tươi", quantity: 2, unit: "BOX" });

    expect(result).toMatchObject({ id: itemId, name: "Sữa tươi", quantity: 2 });
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Sữa tươi", quantity: 2 }) });
    expect(mocks.axios.post).not.toHaveBeenCalled();
  });

  it("does not mark an item purchased when inventory synchronization fails", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
    mocks.axios.post.mockRejectedValue(new Error("inventory unavailable"));

    await expect(ShoppingListService.confirmPurchase(itemId, familyId, userId)).rejects.toMatchObject({
      statusCode: 503,
      code: "INVENTORY_SYNC_FAILED",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.shoppingItem.update).not.toHaveBeenCalled();
  });

  it("keeps the item retryable when inventory returns an unsuccessful envelope", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
    mocks.axios.post.mockResolvedValue({ data: { success: false, message: "Rejected" } });

    await expect(ShoppingListService.confirmPurchase(itemId, familyId, userId)).rejects.toMatchObject({
      statusCode: 503,
      code: "INVENTORY_SYNC_FAILED",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("marks the item purchased and records history only after inventory succeeds", async () => {
    const purchased = shoppingItem({ isPurchased: true, inventoryAppliedAt: new Date(), inventoryItemId });
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
    mocks.axios.post.mockResolvedValue({ data: { success: true, data: { item: { id: inventoryItemId }, alreadyApplied: false } } });
    tx.shoppingItem.update.mockResolvedValue(purchased);

    const result = await ShoppingListService.confirmPurchase(itemId, familyId, userId);

    expect(result).toMatchObject({ item: { isPurchased: true, inventoryItemId }, inventoryItemId, alreadyApplied: false });
    expect(mocks.axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/inventory/internal/purchases"),
      expect.objectContaining({ externalPurchaseId: itemId, familyId, createdByUserId: userId, name: "Sữa tươi", quantity: 2 }),
      expect.objectContaining({ headers: { "x-internal-api-key": expect.any(String) }, timeout: 8000 }),
    );
    expect(tx.shoppingItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId },
      data: expect.objectContaining({ isPurchased: true, inventoryItemId }),
    }));
    expect(tx.purchaseHistory.upsert).toHaveBeenCalledOnce();
  });

  it("returns a previously synced item without sending another inventory request", async () => {
    const synced = shoppingItem({ isPurchased: true, inventoryAppliedAt: new Date(), inventoryItemId });
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(synced);

    await expect(ShoppingListService.confirmPurchase(itemId, familyId, userId)).resolves.toMatchObject({
      item: synced,
      inventoryItemId,
      alreadyApplied: true,
      alreadyPurchased: true,
    });
    expect(mocks.axios.post).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks changes to a purchased item and completion of a non-active list", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem({ isPurchased: true }));
    await expect(ShoppingListService.updateItem(itemId, familyId, { note: "x" })).rejects.toMatchObject({ code: "ITEM_ALREADY_PURCHASED" });

    mocks.prisma.shoppingList.findFirst.mockResolvedValue({ status: "COMPLETED" });
    await expect(ShoppingListService.complete("list-1", familyId)).rejects.toMatchObject({ code: "LIST_NOT_ACTIVE" });
  });
});
