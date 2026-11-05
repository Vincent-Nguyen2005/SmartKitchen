import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  foodItem: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  inventoryLog: { create: vi.fn() },
  purchaseApplication: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { ItemsService } from "./items.service";
import { PurchasesService } from "./purchases.service";
import { listItemsQuerySchema } from "../validators/items.validator";

const familyId = "11111111-1111-4111-8111-111111111111";
const otherFamilyId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const purchaseId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";

describe("ItemsService", () => {
  beforeEach(() => vi.resetAllMocks());

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

  it("looks up an item only inside the requested family and rejects missing items", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue(null);

    await expect(ItemsService.getById(itemId, familyId)).rejects.toThrow("Item not found");
    expect(prismaMock.foodItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId, familyId, deletedAt: null },
    }));
  });

  it("checks family ownership before updating an item", async () => {
    const changes = { quantity: 4 };
    prismaMock.foodItem.findFirst.mockResolvedValue({ id: itemId, familyId });
    prismaMock.foodItem.update.mockResolvedValue({ id: itemId, quantity: 4 });

    await expect(ItemsService.update(itemId, familyId, changes)).resolves.toMatchObject({ quantity: 4 });
    expect(prismaMock.foodItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId, familyId, deletedAt: null },
    }));
    expect(prismaMock.foodItem.update).toHaveBeenCalledWith({ where: { id: itemId }, data: changes, include: { category: true } });
  });

  it("soft-deletes an item without removing its record", async () => {
    prismaMock.foodItem.findFirst.mockResolvedValue({ id: itemId });
    prismaMock.foodItem.update.mockImplementation(async ({ data }: { data: { deletedAt: Date } }) => ({ id: itemId, ...data }));

    const result = await ItemsService.softDelete(itemId, familyId);

    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(prismaMock.foodItem.update).toHaveBeenCalledWith({ where: { id: itemId }, data: { deletedAt: expect.any(Date) } });
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
    foodItem: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    inventoryLog: { create: vi.fn() },
    purchaseApplication: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.purchaseApplication.findUnique.mockResolvedValue(null);
    prismaMock.foodItem.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.foodItem.findFirst.mockResolvedValue(null);
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

  it("restocks a matching active inventory item", async () => {
    tx.foodItem.findFirst.mockResolvedValue({ id: itemId, quantity: 3, status: "NEAR_EXPIRY" });

    await PurchasesService.apply(input);

    expect(tx.foodItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: itemId },
      data: { quantity: { increment: 2 }, status: "FRESH" },
    }));
    expect(tx.foodItem.create).not.toHaveBeenCalled();
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
