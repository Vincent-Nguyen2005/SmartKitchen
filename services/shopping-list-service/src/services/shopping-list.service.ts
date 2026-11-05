import { prisma } from "../lib/prisma";
import axios from "axios";
import { AppError } from "../lib/app-error";
import { LIST_STATUS } from "../lib/constants";
import { UpdateItemBody } from "../validators/shopping-list.validator";

const INVENTORY_API_URL =
  process.env.INVENTORY_API_URL || "http://localhost:4003";
const PURCHASE_SYNC_API_KEY = process.env.PURCHASE_SYNC_API_KEY || (process.env.NODE_ENV === "production" ? "" : "dev-only-purchase-sync-key-change-me");

export class ShoppingListService {
  static async generateFromInventory(familyId: string, authorization: string) {
    const response = await axios.get(
      `${INVENTORY_API_URL}/api/inventory/items?familyId=${familyId}`,
      { headers: { Authorization: authorization }, timeout: 8000 },
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

  static async addItem(data: { familyId: string; shoppingListId?: string; name: string; quantity: number; unit: string; note?: string | null }) {
    return prisma.$transaction(async (transaction) => {
      let list = data.shoppingListId
        ? await transaction.shoppingList.findFirst({ where: { id: data.shoppingListId, familyId: data.familyId } })
        : await transaction.shoppingList.findFirst({ where: { familyId: data.familyId, status: LIST_STATUS.ACTIVE }, orderBy: { createdAt: "desc" } });
      if (data.shoppingListId && !list) throw new AppError(404, "LIST_NOT_FOUND", "Shopping list not found");
      if (list && list.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
      if (!list) {
        list = await transaction.shoppingList.create({
          data: { familyId: data.familyId, name: "Danh sách đi chợ", status: LIST_STATUS.ACTIVE },
        });
      }
      return transaction.shoppingItem.create({
        data: {
          shoppingListId: list.id,
          name: data.name,
          quantity: data.quantity,
          unit: data.unit,
          note: data.note,
        },
      });
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
    purchasedItems.forEach((item: { name: string; unit: string }) => {
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
      select: { isPurchased: true, shoppingList: { select: { status: true } } },
    });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    }
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) {
      throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    }
    if (item.isPurchased) throw new AppError(409, "ITEM_ALREADY_PURCHASED", "Purchased items cannot be changed");
    return prisma.shoppingItem.update({ where: { id }, data });
  }

  static async confirmPurchase(id: string, familyId: string, userId: string) {
    const item = await prisma.shoppingItem.findFirst({
      where: { id, shoppingList: { familyId } },
      include: { shoppingList: { select: { status: true } } },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    if (item.isPurchased && item.inventoryAppliedAt) {
      return { item, inventoryItemId: item.inventoryItemId, alreadyApplied: true, alreadyPurchased: true };
    }
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) {
      throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    }
    if (!PURCHASE_SYNC_API_KEY) throw new AppError(503, "PURCHASE_SYNC_NOT_CONFIGURED", "Inventory synchronization is not configured");

    let inventoryResult: { success?: boolean; data?: { item?: unknown; alreadyApplied?: boolean } };
    try {
      const response = await axios.post(
        `${INVENTORY_API_URL}/api/inventory/internal/purchases`,
        {
          externalPurchaseId: item.id,
          familyId,
          createdByUserId: userId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
        },
        { headers: { "x-internal-api-key": PURCHASE_SYNC_API_KEY }, timeout: 8000 },
      );
      inventoryResult = response.data;
      if (inventoryResult.success !== true) throw new Error("Inventory service rejected the purchase");
    } catch {
      throw new AppError(503, "INVENTORY_SYNC_FAILED", "The item was not marked purchased because inventory could not be updated. Retry to try again.");
    }

    const syncedInventoryItemId = inventoryResult.data?.item && typeof inventoryResult.data.item === "object" && "id" in inventoryResult.data.item
      ? String((inventoryResult.data.item as { id: string }).id)
      : null;
    const purchasedItem = await prisma.$transaction(async (transaction) => {
      const current = await transaction.shoppingItem.findFirst({ where: { id, shoppingList: { familyId } } });
      if (!current) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
      const updated = await transaction.shoppingItem.update({
        where: { id },
        data: {
          isPurchased: true,
          inventoryAppliedAt: current.inventoryAppliedAt ?? new Date(),
          inventoryItemId: current.inventoryItemId ?? syncedInventoryItemId,
        },
      });
      await transaction.purchaseHistory.upsert({
        where: { shoppingItemId: id },
        create: {
          familyId,
          itemKey: item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          shoppingItemId: id,
        },
        update: {
          familyId,
          itemKey: item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          purchasedAt: new Date(),
        },
      });
      return updated;
    });

    return {
      item: purchasedItem,
      inventoryItemId: purchasedItem.inventoryItemId,
      alreadyApplied: inventoryResult.data?.alreadyApplied ?? false,
      alreadyPurchased: item.isPurchased,
    };
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
