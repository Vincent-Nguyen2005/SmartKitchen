import { prisma } from "../lib/prisma";
import axios from "axios";
import { AppError } from "../lib/app-error";
import { LIST_STATUS } from "../lib/constants";
import { UpdateItemBody } from "../validators/shopping-list.validator";

const INVENTORY_API_URL =
  process.env.INVENTORY_API_URL || "http://localhost:4003";

export class ShoppingListService {
  static async generateFromInventory(familyId: string) {
    const response = await axios.get(
      `${INVENTORY_API_URL}/api/inventory/items?familyId=${familyId}`,
    );
    const allItems = response.data.items || [];

    const missingItems = allItems.filter(
      (item: any) =>
        item.status === "NEAR_EXPIRY" ||
        item.status === "EXPIRED" ||
        item.quantity <= 0,
    );

    if (missingItems.length === 0) {
      return { message: "Không có nguyên liệu nào cần mua thêm", items: [] };
    }

    const shoppingList = await prisma.shoppingList.create({
      data: {
        familyId,
        name: `Đi chợ tự động - ${new Date().toLocaleDateString("vi-VN")}`,
        status: "ACTIVE",
        items: {
          create: missingItems.map((item: any) => ({
            name: item.name,
            quantity: 1,
            unit: item.unit,
            note: `Tự động tạo vì sắp hết (còn ${item.quantity})`,
          })),
        },
      },
      include: { items: true },
    });

    return shoppingList;
  }

  static async list(familyId: string) {
    return prisma.shoppingList.findMany({
      where: { familyId, status: "ACTIVE" },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }
  static async getSuggestions(familyId: string) {
    // Lấy tất cả các item đã mua thành công
    const purchasedItems = await prisma.shoppingItem.findMany({
      where: {
        isPurchased: true,
        shoppingList: { familyId },
      },
      select: { name: true, unit: true },
    });

    // Đếm tần suất xuất hiện của từng món
    const frequencyMap: Record<string, { count: number; unit: string }> = {};
    purchasedItems.forEach((item) => {
      if (frequencyMap[item.name]) {
        frequencyMap[item.name].count += 1;
      } else {
        frequencyMap[item.name] = { count: 1, unit: item.unit };
      }
    });

    // Sắp xếp giảm dần theo số lần mua và lấy top 5
    const suggestions = Object.entries(frequencyMap)
      .map(([name, data]) => ({ name, count: data.count, unit: data.unit }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return suggestions;
  }
  static async updateItem(id: string, familyId: string, data: UpdateItemBody) {
    const item = await prisma.shoppingItem.findFirst({
      where: { id, shoppingList: { familyId } },
      select: { shoppingList: { select: { status: true } } },
    });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    }
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) {
      throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    }
    return prisma.shoppingItem.update({ where: { id }, data });
  }

  static async complete(id: string, familyId: string) {
    const list = await prisma.shoppingList.findFirst({
      where: { id, familyId },
      select: { status: true },
    });
    if (!list) {
      throw new AppError(404, "NOT_FOUND", "Shopping list not found");
    }
    if (list.status !== LIST_STATUS.ACTIVE) {
      throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    }
    return prisma.shoppingList.update({
      where: { id },
      data: { status: LIST_STATUS.COMPLETED },
      include: { items: true },
    });
  }
}
