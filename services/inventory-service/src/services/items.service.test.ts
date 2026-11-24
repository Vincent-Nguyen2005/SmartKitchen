import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  foodItem: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  inventoryLog: { create: vi.fn() },
  category: { upsert: vi.fn() },
  purchaseApplication: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { ItemsService } from "./items.service";
import { PurchasesService } from "./purchases.service";
import { listItemsQuerySchema } from "../validators/items.validator";

const itemTx = {
  foodItem: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  inventoryLog: { create: vi.fn() },
};

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const purchaseId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";

describe("ItemsService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation((callback: (transaction: typeof itemTx) => Promise<unknown>) => callback(itemTx));
  });

  it("creates a food item with the validated family and product fields", async () => {
    const input = {
      familyId,
      name: "Sữa tươi",
      quantity: 2,
      unit: "BOX" as const,
      storageLocation: "FRIDGE" as const,
    };
    prismaMock.foodItem.create.mockResolvedValue({ id: itemId, ...input });

    await expect(ItemsService.create(input)).resolves.toMatchObject({ id: itemId, name: "Sữa tươi" });
    expect(prismaMock.foodItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ familyId, name: "Sữa tươi", quantity: 2, unit: "BOX" }),
      include: { category: true },
    });
  });

  it("creates the free-text group as a category on first use", async () => {
    const categoryId = "66666666-6666-4666-8666-666666666666";
    prismaMock.category.upsert.mockResolvedValue({ id: categoryId });
    prismaMock.foodItem.create.mockResolvedValue({ id: itemId });

    await ItemsService.create({ familyId, name: "Rau muống", quantity: 1, unit: "PACK", storageLocation: "FRIDGE", categoryName: "Rau củ" });

    expect(prismaMock.category.upsert).toHaveBeenCalledWith({ where: { name: "Rau củ" }, create: { name: "Rau củ" }, update: {}, select: { id: true } });
    expect(prismaMock.foodItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryId }) }));
    expect(prismaMock.foodItem.create.mock.calls[0][0].data).not.toHaveProperty("categoryName");
  });

  it("scopes list results to the family and excludes soft-deleted items", async () => {
    const query = listItemsQuerySchema.parse({ familyId, limit: "10", search: "sữa" });
    prismaMock.foodItem.findMany.mockResolvedValue([{ id: itemId, name: "Sữa" }]);
    prismaMock.foodItem.count.mockResolvedValue(1);

    const result = await ItemsService.list(query);

    expect(result).toMatchObject({ pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    expect(prismaMock.foodItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, familyId, name: { contains: "sữa", mode: "insensitive" } },
      skip: 0,
      take: 10,
    }));
  });

  it("reports an empty inventory as one valid empty page", async () => {
    const query = listItemsQuerySchema.parse({ familyId, page: "1", limit: "100" });
    prismaMock.foodItem.findMany.mockResolvedValue([]);
    prismaMock.foodItem.count.mockResolvedValue(0);

    await expect(ItemsService.list(query)).resolves.toMatchObject({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
    });
  });

  it("looks up an item only inside the requested family and rejects missing items", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue(null);

    await expect(ItemsService.getById(itemId, familyId)).rejects.toThrow("Item not found");
    expect(prismaMock.foodItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId, familyId, deletedAt: null },
    }));
  });

  it("checks family ownership before updating an item", async () => {
    const changes = { quantity: 4 };
    itemTx.foodItem.findFirst.mockResolvedValue({ id: itemId, familyId, quantity: 2, unit: "PIECE", status: "FRESH" });
    itemTx.foodItem.update.mockResolvedValue({ id: itemId, quantity: 4, unit: "PIECE", status: "FRESH" });

    await expect(ItemsService.update(itemId, familyId, changes, userId)).resolves.toMatchObject({ quantity: 4 });
    expect(itemTx.foodItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId, familyId, deletedAt: null },
    }));
    expect(itemTx.foodItem.update).toHaveBeenCalledWith({ where: { id: itemId }, data: changes, include: { category: true } });
    expect(itemTx.inventoryLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      itemId,
      action: "MANUAL_ADJUSTMENT",
      oldValue: { quantity: 2, unit: "PIECE", status: "FRESH" },
      newValue: { quantity: 4, unit: "PIECE", status: "FRESH" },
      createdBy: userId,
    }) });
    expect(itemTx.inventoryLog.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "CONSUMPTION" }) }));
  });

  it("atomically decrements stock and records an explicit consumption delta", async () => {
    const item = { id: itemId, familyId, quantity: 1.5, unit: "KILOGRAM", status: "FRESH" };
    itemTx.foodItem.findFirst.mockResolvedValueOnce({ ...item, quantity: 2 });
    itemTx.foodItem.findFirst.mockResolvedValueOnce(item);
    itemTx.foodItem.updateMany.mockResolvedValue({ count: 1 });

    await expect(ItemsService.consume(itemId, familyId, 0.5, userId)).resolves.toMatchObject({ quantity: 1.5 });
    expect(itemTx.foodItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: itemId,
        familyId,
        deletedAt: null,
        status: { notIn: ["EXPIRED", "DISCARDED", "CONSUMED"] },
        quantity: { gte: 0.5 },
      },
      data: { quantity: { decrement: 0.5 } },
    });
    expect(itemTx.inventoryLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "CONSUMPTION",
      oldValue: { quantity: 2, unit: "KILOGRAM", status: "FRESH" },
      newValue: { quantity: 1.5, unit: "KILOGRAM", status: "FRESH" },
      createdBy: userId,
    }) });
  });

  it("logs status-only manual inventory updates for audit", async () => {
    itemTx.foodItem.findFirst.mockResolvedValue({ id: itemId, familyId, quantity: 2, unit: "PIECE", status: "FRESH" });
    itemTx.foodItem.update.mockResolvedValue({ id: itemId, quantity: 2, unit: "PIECE", status: "DISCARDED" });

    await expect(ItemsService.update(itemId, familyId, { status: "DISCARDED" }, userId)).resolves.toMatchObject({ status: "DISCARDED" });
    expect(itemTx.inventoryLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "MANUAL_ADJUSTMENT",
      oldValue: { quantity: 2, unit: "PIECE", status: "FRESH" },
      newValue: { quantity: 2, unit: "PIECE", status: "DISCARDED" },
    }) });
  });

  it("restores a consumed item to fresh when stock is manually restored", async () => {
    itemTx.foodItem.findFirst.mockResolvedValue({ id: itemId, familyId, quantity: 0, unit: "PIECE", status: "CONSUMED" });
    itemTx.foodItem.update.mockResolvedValue({ id: itemId, quantity: 2, unit: "PIECE", status: "FRESH" });

    await expect(ItemsService.update(itemId, familyId, { quantity: 2 }, userId)).resolves.toMatchObject({ quantity: 2, status: "FRESH" });
    expect(itemTx.foodItem.update).toHaveBeenCalledWith({ where: { id: itemId }, data: { quantity: 2, status: "FRESH" }, include: { category: true } });
    expect(itemTx.inventoryLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "MANUAL_ADJUSTMENT",
      oldValue: { quantity: 0, unit: "PIECE", status: "CONSUMED" },
      newValue: { quantity: 2, unit: "PIECE", status: "FRESH" },
    }) });
  });

  it("rejects a consume request when stock changed and no longer covers the amount", async () => {
    itemTx.foodItem.findFirst.mockResolvedValueOnce({ id: itemId, familyId, quantity: 1, unit: "PIECE", status: "FRESH" });
    itemTx.foodItem.updateMany.mockResolvedValue({ count: 0 });
    itemTx.foodItem.findFirst.mockResolvedValueOnce({ id: itemId, familyId, quantity: 0.25, unit: "PIECE", status: "FRESH" });

    await expect(ItemsService.consume(itemId, familyId, 0.5, userId)).rejects.toMatchObject({
      statusCode: 409,
      code: "INSUFFICIENT_STOCK",
    });
    expect(itemTx.inventoryLog.create).not.toHaveBeenCalled();
  });

  it("marks an item consumed when the atomic decrement reaches zero", async () => {
    const current = { id: itemId, familyId, quantity: 0, unit: "PIECE", status: "FRESH" };
    itemTx.foodItem.findFirst.mockResolvedValueOnce({ ...current, quantity: 1 });
    itemTx.foodItem.findFirst.mockResolvedValueOnce(current);
    itemTx.foodItem.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });

    await expect(ItemsService.consume(itemId, familyId, 1, userId)).resolves.toMatchObject({ status: "CONSUMED", quantity: 0 });
    expect(itemTx.foodItem.updateMany).toHaveBeenCalledTimes(2);
    expect(itemTx.foodItem.updateMany).toHaveBeenLastCalledWith({
      where: { id: itemId, familyId, deletedAt: null, quantity: 0, status: "FRESH" },
      data: { status: "CONSUMED" },
    });
  });

  it("soft-deletes an item without removing its record", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue({ id: itemId });
    prismaMock.foodItem.update.mockImplementation(async ({ data }: { data: { deletedAt: Date } }) => ({ id: itemId, ...data }));

    const result = await ItemsService.softDelete(itemId, familyId);

    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(prismaMock.foodItem.update).toHaveBeenCalledWith({ where: { id: itemId }, data: { deletedAt: expect.any(Date), imageUrl: null } });
  });
});

describe("PurchasesService", () => {
  const input = {
    externalPurchaseId: purchaseId,
    familyId,
    createdByUserId: userId,
    name: "Gạo",
    quantity: 2,
    unit: "KILOGRAM" as const,
  };
  const tx = {
    foodItem: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    inventoryLog: { create: vi.fn() },
    purchaseApplication: { create: vi.fn() },
    category: { upsert: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.purchaseApplication.findUnique.mockResolvedValue(null);
    prismaMock.foodItem.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.foodItem.findMany.mockResolvedValue([]);
    tx.foodItem.create.mockResolvedValue({ id: itemId, familyId, name: input.name, quantity: input.quantity, unit: input.unit, status: "FRESH" });
    tx.foodItem.update.mockResolvedValue({ id: itemId, name: input.name, quantity: 5, unit: input.unit, status: "FRESH" });
    tx.inventoryLog.create.mockResolvedValue({ id: "log-1" });
    tx.purchaseApplication.create.mockResolvedValue({ externalPurchaseId: purchaseId, familyId, itemId });
  });

  it("creates inventory and records an application in one transaction", async () => {
    const result = await PurchasesService.apply(input);

    expect(result).toMatchObject({ item: { id: itemId, quantity: 2 }, alreadyApplied: false });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(tx.foodItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ familyId, name: "Gạo", quantity: 2, unit: "KILOGRAM", storageLocation: "PANTRY" }),
    }));
    expect(tx.inventoryLog.create).toHaveBeenCalledOnce();
    expect(tx.purchaseApplication.create).toHaveBeenCalledWith({ data: { externalPurchaseId: purchaseId, familyId, itemId } });
  });

  it("creates the item with the cart's group and expiry day when given", async () => {
    tx.category.upsert.mockResolvedValue({ id: "cat-1" });

    await PurchasesService.apply({ ...input, categoryName: "Đồ khô", expiryDate: "2026-12-01" });

    expect(tx.category.upsert).toHaveBeenCalledWith({ where: { name: "Đồ khô" }, create: { name: "Đồ khô" }, update: {}, select: { id: true } });
    expect(tx.foodItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ categoryId: "cat-1", expiryDate: new Date("2026-12-01T00:00:00.000Z") }),
    }));
  });

  it("fills a missing expiry on restock but keeps an expiry the family already set", async () => {
    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, quantity: 3, status: "FRESH", expiryDate: null, categoryId: null }]);
    await PurchasesService.apply({ ...input, expiryDate: "2026-12-01" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { quantity: { increment: 2 }, status: "FRESH", expiryDate: new Date("2026-12-01T00:00:00.000Z") },
    }));

    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, quantity: 3, status: "FRESH", expiryDate: new Date("2026-11-25T00:00:00.000Z"), categoryId: null }]);
    await PurchasesService.apply({ ...input, expiryDate: "2026-12-01" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { quantity: { increment: 2 }, status: "FRESH" },
    }));
  });

  it("stores the catalog product id on a new item, and on a restock only when the item has none", async () => {
    await PurchasesService.apply({ ...input, productId: "prod-1" });
    expect(tx.foodItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: "prod-1" }) }));

    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, quantity: 3, status: "FRESH", expiryDate: null, categoryId: null, productId: null }]);
    await PurchasesService.apply({ ...input, productId: "prod-1" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { quantity: { increment: 2 }, status: "FRESH", productId: "prod-1" } }));

    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, quantity: 3, status: "FRESH", expiryDate: null, categoryId: null, productId: "prod-old" }]);
    await PurchasesService.apply({ ...input, productId: "prod-1" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { quantity: { increment: 2 }, status: "FRESH" } }));
  });

  it("restocks a matching active inventory item", async () => {
    tx.foodItem.findMany.mockResolvedValue([{ id: itemId, quantity: 3, status: "NEAR_EXPIRY" }]);

    await PurchasesService.apply(input);

    expect(tx.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId },
      data: { quantity: { increment: 2 }, status: "FRESH" },
    }));
    expect(tx.foodItem.create).not.toHaveBeenCalled();
  });

  it("merges kg bought into a Kho row in g (and l into ml), converting the amount; packs never convert", async () => {
    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, name: "Thịt ba chỉ", quantity: 500, unit: "GRAM", status: "FRESH", expiryDate: null, categoryId: null, productId: null }]);
    await PurchasesService.apply({ ...input, name: "Thịt ba chỉ", quantity: 1.5, unit: "KILOGRAM" });
    expect(tx.foodItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ unit: { in: ["KILOGRAM", "GRAM"] } }) }));
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: itemId }, data: { quantity: { increment: 1500 }, status: "FRESH" } }));

    // A row already in kg wins over an older row in g.
    tx.foodItem.findMany.mockResolvedValueOnce([
      { id: "g-row", quantity: 200, unit: "GRAM", status: "FRESH" },
      { id: itemId, quantity: 1, unit: "KILOGRAM", status: "FRESH" },
    ]);
    await PurchasesService.apply({ ...input, name: "Thịt ba chỉ", quantity: 0.3, unit: "KILOGRAM" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: itemId }, data: { quantity: { increment: 0.3 }, status: "FRESH" } }));

    tx.foodItem.findMany.mockResolvedValueOnce([{ id: itemId, quantity: 400, unit: "MILLILITER", status: "FRESH" }]);
    await PurchasesService.apply({ ...input, name: "Sữa tươi", quantity: 1, unit: "LITER" });
    expect(tx.foodItem.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { quantity: { increment: 1000 }, status: "FRESH" } }));

    tx.foodItem.findMany.mockResolvedValueOnce([]);
    await PurchasesService.apply({ ...input, name: "Hành lá", quantity: 2, unit: "PACK" });
    expect(tx.foodItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ unit: { in: ["PACK"] } }) }));
    expect(tx.foodItem.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Hành lá", quantity: 2, unit: "PACK" }) }));
  });

  it("returns a previously applied purchase without opening another transaction", async () => {
    prismaMock.purchaseApplication.findUnique.mockResolvedValue({ externalPurchaseId: purchaseId, familyId, itemId });
    prismaMock.foodItem.findUnique.mockResolvedValue({ id: itemId, quantity: 2 });

    await expect(PurchasesService.apply(input)).resolves.toMatchObject({ item: { id: itemId }, alreadyApplied: true });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a purchase identifier that belongs to a different family", async () => {
    prismaMock.purchaseApplication.findUnique.mockResolvedValue({ externalPurchaseId: purchaseId, familyId: otherFamilyId, itemId });

    await expect(PurchasesService.apply(input)).rejects.toMatchObject({ statusCode: 409, code: "PURCHASE_FAMILY_MISMATCH" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("handles a concurrent retry after the unique idempotency constraint wins", async () => {
    const applied = { externalPurchaseId: purchaseId, familyId, itemId };
    prismaMock.purchaseApplication.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(applied);
    prismaMock.foodItem.findUnique.mockResolvedValue({ id: itemId, quantity: 2 });
    tx.purchaseApplication.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(PurchasesService.apply(input)).resolves.toMatchObject({ item: { id: itemId }, alreadyApplied: true });
  });
});
