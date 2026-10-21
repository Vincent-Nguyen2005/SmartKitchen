import { prisma } from "../lib/prisma";
import axios from "axios";

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
}
