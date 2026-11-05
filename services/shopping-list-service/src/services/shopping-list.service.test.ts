import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    shoppingList: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    shoppingItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
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
const menuId = "88888888-8888-4888-8888-888888888888";

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
    shoppingItem: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    purchaseHistory: { upsert: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.shoppingList.findFirst.mockResolvedValue(null);
    tx.shoppingList.create.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: itemId, ...data }));
    tx.shoppingItem.findFirst.mockResolvedValue(null);
    tx.shoppingItem.findMany.mockResolvedValue([]);
    tx.shoppingItem.deleteMany.mockResolvedValue({ count: 0 });
    tx.shoppingItem.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...shoppingItem(), ...data }));
    tx.purchaseHistory.upsert.mockResolvedValue({ shoppingItemId: itemId });
  });

  const menuResponse = (ingredients: Array<{ name: string; quantity: number; unit: string }>) => ({
    success: true,
    data: { menuId, familyId, ingredients },
  });

  const configureMenuAndInventory = (
    ingredients: Array<{ name: string; quantity: number; unit: string }>,
    inventory: Array<Record<string, unknown>> = [],
  ) => {
    mocks.axios.get.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/menus/current")) return { data: menuResponse(ingredients) };
      return { data: { success: true, items: inventory, pagination: { page: 1, limit: 100, total: inventory.length, totalPages: 1 } } };
    });
  };

  it("stores a reference item without calling inventory", async () => {
    const result = await ShoppingListService.addItem({ familyId, name: "Sữa tươi", quantity: 2, unit: "BOX" });

    expect(result).toMatchObject({ id: itemId, name: "Sữa tươi", quantity: 2 });
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Sữa tươi", quantity: 2 }) });
    expect(mocks.axios.post).not.toHaveBeenCalled();
  });

  it("generates the cross-unit menu deficit and forwards the bearer token", async () => {
    configureMenuAndInventory(
      [{ name: "Gạo", quantity: 2, unit: "KILOGRAM" }],
      [
        { name: " GẠO ", quantity: 500, unit: "GRAM", status: "FRESH", expiryDate: null },
        { name: "Gạo", quantity: 9, unit: "KILOGRAM", status: "EXPIRED", expiryDate: "2026-11-01T00:00:00.000Z" },
        { name: "Gạo", quantity: 7, unit: "KILOGRAM", status: "DISCARDED", expiryDate: null },
      ],
    );
    tx.shoppingList.findFirst.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: itemId, ...data }));

    const result = await ShoppingListService.generateFromMenu(familyId, "Bearer token");

    expect(result).toMatchObject({ menuId, listId: "list-1", items: [{ name: "Gạo", quantity: 1.5, unit: "KILOGRAM" }] });
    expect(mocks.axios.get).toHaveBeenNthCalledWith(1, expect.stringContaining("/api/menus/current"), expect.objectContaining({
      params: { familyId },
      headers: { Authorization: "Bearer token" },
    }));
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      shoppingListId: "list-1",
      generatedKey: "gạo|GRAM",
      sourceMenuId: menuId,
      quantity: 1.5,
    }) });
  });

  it("does not subtract inventory with an incompatible dimension", async () => {
    configureMenuAndInventory(
      [{ name: "Sữa", quantity: 1, unit: "LITER" }],
      [{ name: "Sữa", quantity: 1000, unit: "GRAM", status: "FRESH", expiryDate: null }],
    );
    tx.shoppingList.findFirst.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: itemId, ...data }));

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).resolves.toMatchObject({
      items: [{ name: "Sữa", quantity: 1, unit: "LITER" }],
    });
    expect(tx.shoppingItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ generatedKey: "sữa|MILLILITER" }) });
  });

  it("does not write a list when the current Menu cannot be loaded", async () => {
    mocks.axios.get.mockRejectedValue(Object.assign(new Error("not found"), {
      response: { status: 404, data: { code: "CURRENT_MENU_NOT_FOUND" } },
    }));

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).rejects.toMatchObject({
      statusCode: 409,
      code: "CURRENT_MENU_NOT_FOUND",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reports a missing Menu route as an integration blocker instead of claiming there is no current menu", async () => {
    mocks.axios.get.mockRejectedValue(Object.assign(new Error("route missing"), {
      response: { status: 404, data: "Cannot GET /api/menus/current" },
    }));

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).rejects.toMatchObject({
      statusCode: 502,
      code: "MENU_CONTRACT_UNAVAILABLE",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves Menu family access failures instead of misreporting them as an outage", async () => {
    mocks.axios.get.mockRejectedValue(Object.assign(new Error("forbidden"), {
      response: { status: 403, data: { code: "FAMILY_ACCESS_DENIED" } },
    }));

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).rejects.toMatchObject({
      statusCode: 403,
      code: "MENU_FAMILY_ACCESS_DENIED",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not write a list when Menu returns a malformed contract", async () => {
    mocks.axios.get.mockResolvedValue({ data: { success: true, data: { menuId, familyId, ingredients: "not-an-array" } } });

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).rejects.toMatchObject({
      statusCode: 502,
      code: "MENU_CONTRACT_INVALID",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("clears old generated rows for an empty current menu without calling Inventory", async () => {
    configureMenuAndInventory([]);
    tx.shoppingList.findFirst.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.findMany.mockResolvedValue([{ id: itemId, generatedKey: "gạo|GRAM" }]);

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).resolves.toMatchObject({
      menuId,
      items: [],
      message: "Menu hiện tại chưa có nguyên liệu để đối chiếu",
    });
    expect(mocks.axios.get).toHaveBeenCalledOnce();
    expect(tx.shoppingItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [itemId] }, isPurchased: false } });
    expect(tx.shoppingList.create).not.toHaveBeenCalled();
  });

  it("does not write a list when Inventory returns an invalid contract", async () => {
    mocks.axios.get
      .mockResolvedValueOnce({ data: menuResponse([{ name: "Gạo", quantity: 1, unit: "KILOGRAM" }]) })
      .mockResolvedValueOnce({ data: { success: true, items: "not-an-array" } });

    await expect(ShoppingListService.generateFromMenu(familyId, "Bearer token")).rejects.toMatchObject({
      statusCode: 502,
      code: "INVENTORY_CONTRACT_INVALID",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates an existing generated row on repeated menu generation instead of duplicating it", async () => {
    configureMenuAndInventory([{ name: "Sữa", quantity: 3, unit: "LITER" }]);
    tx.shoppingList.findFirst.mockResolvedValue({ id: "list-1", familyId, status: "ACTIVE" });
    tx.shoppingItem.findMany.mockResolvedValue([{ id: itemId, generatedKey: "sữa|MILLILITER" }]);
    tx.shoppingItem.findFirst.mockResolvedValue({ id: itemId, generatedKey: "sữa|MILLILITER" });
    tx.shoppingItem.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...shoppingItem(), ...data }));

    await ShoppingListService.generateFromMenu(familyId, "Bearer token");
    await ShoppingListService.generateFromMenu(familyId, "Bearer token");

    expect(tx.shoppingItem.create).not.toHaveBeenCalled();
    expect(tx.shoppingItem.update).toHaveBeenCalledTimes(2);
    expect(tx.shoppingItem.deleteMany).not.toHaveBeenCalled();
  });

  it("projects consumption history and subtracts usable inventory for suggestions", async () => {
    const consumedAt = new Date("2026-11-05T08:00:00.000Z");
    mocks.axios.get
      .mockResolvedValueOnce({ data: { success: true, data: {
        events: [{ name: "Gạo", unit: "KILOGRAM", quantity: 9, consumedAt }],
        windowDays: 90,
        pagination: { hasMore: false, nextCursor: null },
      } } })
      .mockResolvedValueOnce({ data: {
        success: true,
      items: [{ name: "GẠO", quantity: 1, unit: "KILOGRAM", status: "FRESH", expiryDate: null }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      } });

    await expect(ShoppingListService.getSuggestions(familyId, "Bearer token")).resolves.toMatchObject([{
      name: "Gạo",
      unit: "KILOGRAM",
      consumedQuantity: 9,
      availableQuantity: 1,
      suggestedQuantity: 0.4,
      periodDays: 14,
      historyDays: 90,
      consumptionEvents: 1,
    }]);
  });

  it("reads every page of consumption history before calculating a forecast", async () => {
    const consumedAt = new Date("2026-11-05T08:00:00.000Z").toISOString();
    const nextCursor = "99999999-9999-4999-8999-999999999999";
    mocks.axios.get
      .mockResolvedValueOnce({ data: { success: true, data: {
        events: [{ name: "Gạo", unit: "KILOGRAM", quantity: 4, consumedAt }],
        windowDays: 90,
        pagination: { hasMore: true, nextCursor },
      } } })
      .mockResolvedValueOnce({ data: { success: true, data: {
        events: [{ name: "Gạo", unit: "KILOGRAM", quantity: 5, consumedAt }],
        windowDays: 90,
        pagination: { hasMore: false, nextCursor: null },
      } } })
      .mockResolvedValueOnce({ data: { success: true, items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } } });

    await expect(ShoppingListService.getSuggestions(familyId, "Bearer token")).resolves.toMatchObject([{
      consumedQuantity: 9,
      suggestedQuantity: 1.4,
      consumptionEvents: 2,
    }]);
    expect(mocks.axios.get).toHaveBeenNthCalledWith(2, expect.stringContaining("/api/inventory/consumption"), expect.objectContaining({
      params: { familyId, days: 90, limit: 250, cursor: nextCursor },
    }));
  });

  it("deletes only an unpurchased item from an active family list", async () => {
    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
    mocks.prisma.shoppingItem.delete.mockResolvedValue(shoppingItem());

    await expect(ShoppingListService.removeItem(itemId, familyId)).resolves.toBeUndefined();
    expect(mocks.prisma.shoppingItem.delete).toHaveBeenCalledWith({ where: { id: itemId } });

    mocks.prisma.shoppingItem.findFirst.mockResolvedValue(shoppingItem({ isPurchased: true }));
    await expect(ShoppingListService.removeItem(itemId, familyId)).rejects.toMatchObject({ code: "ITEM_ALREADY_PURCHASED" });
    expect(mocks.prisma.shoppingItem.delete).toHaveBeenCalledOnce();
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
    tx.shoppingItem.findFirst.mockResolvedValue(shoppingItem());
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

  it("completes an active list and releases its family active-list key", async () => {
    mocks.prisma.shoppingList.findFirst.mockResolvedValue({ status: "ACTIVE" });
    mocks.prisma.shoppingList.update.mockResolvedValue({ id: "list-1", familyId, status: "COMPLETED", items: [] });

    await expect(ShoppingListService.complete("list-1", familyId)).resolves.toMatchObject({ status: "COMPLETED" });
    expect(mocks.prisma.shoppingList.update).toHaveBeenCalledWith({
      where: { id: "list-1" },
      data: { status: "COMPLETED", activeFamilyId: null },
      include: { items: true },
    });
  });
});
