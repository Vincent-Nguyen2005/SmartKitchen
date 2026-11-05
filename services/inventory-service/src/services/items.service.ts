import { prisma } from "../lib/prisma";
import {
  CreateItemInput,
  UpdateItemInput,
  ListItemsQuery,
} from "../validators/items.validator";

export class ItemsService {
  static async create(data: CreateItemInput) {
    return prisma.foodItem.create({
      data: {
        familyId: data.familyId,
        name: data.name,
        description: data.description,
        quantity: data.quantity,
        unit: data.unit,
        minQuantity: data.minQuantity,
        categoryId: data.categoryId,
        storageLocation: data.storageLocation,
        expiryDate: data.expiryDate,
        imageUrl: data.imageUrl,
        barcode: data.barcode,
      },
      include: { category: true },
    });
  }

  static async list(query: ListItemsQuery) {
    const { page, limit, search, ...filters } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null, ...filters };
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      prisma.foodItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { category: true },
      }),
      prisma.foodItem.count({ where }),
    ]);

    return {
      items,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  static async getById(id: string, familyId: string) {
    const item = await prisma.foodItem.findFirst({
      where: { id, familyId, deletedAt: null },
      include: {
        category: true,
        logs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!item) throw new Error("Item not found");
    return item;
  }

  static async update(id: string, familyId: string, data: UpdateItemInput, userId?: string) {
    return prisma.$transaction(async (transaction) => {
      const previous = await transaction.foodItem.findFirst({
        where: { id, familyId, deletedAt: null },
      });
      if (!previous) throw new Error("Item not found");

      const updateData: UpdateItemInput = { ...data };
      if (typeof data.quantity === "number" && data.quantity > 0 && previous.status === "CONSUMED" && data.status === undefined) {
        updateData.status = "FRESH";
      }
      const updated = await transaction.foodItem.update({
        where: { id },
        data: updateData,
        include: { category: true },
      });
      const quantityChanged = typeof data.quantity === "number" && data.quantity !== previous.quantity;
      const statusChanged = updated.status !== previous.status;
      const unitChanged = typeof data.unit === "string" && data.unit !== previous.unit;
      if (quantityChanged || statusChanged || unitChanged) {
        await transaction.inventoryLog.create({
          data: {
            itemId: id,
            action: "MANUAL_ADJUSTMENT",
            oldValue: { quantity: previous.quantity, unit: previous.unit, status: previous.status },
            newValue: { quantity: updated.quantity, unit: updated.unit, status: updated.status },
            note: "Quantity, unit or status changed through a manual inventory update",
            createdBy: userId,
          },
        });
      }
      return updated;
    });
  }

  static async consume(id: string, familyId: string, quantity: number, userId: string) {
    return prisma.$transaction(async (transaction) => {
      const previous = await transaction.foodItem.findFirst({
        where: { id, familyId, deletedAt: null },
      });
      if (!previous) throw new Error("Item not found");
      if (["EXPIRED", "DISCARDED", "CONSUMED"].includes(previous.status)) {
        throw Object.assign(new Error("This item cannot be consumed in its current status"), {
          statusCode: 409,
          code: "ITEM_NOT_CONSUMABLE",
        });
      }

      // Apply the decrement in SQL so overlapping consume requests cannot both
      // spend the same stock observed by the initial read.
      const decrement = await transaction.foodItem.updateMany({
        where: {
          id,
          familyId,
          deletedAt: null,
          status: { notIn: ["EXPIRED", "DISCARDED", "CONSUMED"] },
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (decrement.count !== 1) {
        const current = await transaction.foodItem.findFirst({ where: { id, familyId, deletedAt: null } });
        if (!current) throw new Error("Item not found");
        if (["EXPIRED", "DISCARDED", "CONSUMED"].includes(current.status)) {
          throw Object.assign(new Error("This item cannot be consumed in its current status"), {
            statusCode: 409,
            code: "ITEM_NOT_CONSUMABLE",
          });
        }
        if (quantity > current.quantity) {
          throw Object.assign(new Error("Consumed quantity exceeds current stock"), {
            statusCode: 409,
            code: "INSUFFICIENT_STOCK",
          });
        }
        throw Object.assign(new Error("Inventory changed while recording consumption; retry the request"), {
          statusCode: 409,
          code: "CONSUMPTION_CONFLICT",
        });
      }

      let updated = await transaction.foodItem.findFirst({
        where: { id, familyId, deletedAt: null },
        include: { category: true },
      });
      if (!updated) throw new Error("Item not found");
      if (updated.quantity === 0 && updated.status !== "CONSUMED") {
        const markedConsumed = await transaction.foodItem.updateMany({
          where: { id, familyId, deletedAt: null, quantity: 0, status: updated.status },
          data: { status: "CONSUMED" },
        });
        if (markedConsumed.count === 1) updated = { ...updated, status: "CONSUMED" };
        else {
          updated = await transaction.foodItem.findFirst({
            where: { id, familyId, deletedAt: null },
            include: { category: true },
          });
          if (!updated) throw new Error("Item not found");
        }
      }

      // Store the exact consumed delta even if another transaction changes the
      // remaining stock before this transaction reads the post-decrement row.
      const remaining = updated.quantity;
      await transaction.inventoryLog.create({
        data: {
          itemId: id,
          action: "CONSUMPTION",
          oldValue: { quantity: remaining + quantity, unit: previous.unit, status: previous.status },
          newValue: { quantity: remaining, unit: previous.unit, status: updated.status },
          note: `Consumed ${quantity} ${previous.unit}`,
          createdBy: userId,
        },
      });
      return updated;
    });
  }

  static async softDelete(id: string, familyId: string) {
    await this.getById(id, familyId);
    return prisma.foodItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
