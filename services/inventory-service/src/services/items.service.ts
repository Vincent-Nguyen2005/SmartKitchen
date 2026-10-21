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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getById(id: string) {
    const item = await prisma.foodItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        logs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!item) throw new Error("Item not found");
    return item;
  }

  static async update(id: string, data: UpdateItemInput) {
    await this.getById(id);
    return prisma.foodItem.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  static async softDelete(id: string) {
    await this.getById(id);
    return prisma.foodItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
