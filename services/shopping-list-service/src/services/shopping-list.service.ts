import axios from "axios";
import type { CatalogInfo } from "./spending.service";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";
import { mergedQuantity, quantityProblem } from "../lib/quantity-rule";
import { LIST_STATUS } from "../lib/constants";
import { UpdateItemBody } from "../validators/shopping-list.validator";

const INVENTORY_API_URL = process.env.INVENTORY_API_URL || (process.env.NODE_ENV === "production" ? "http://inventory-service:4003" : "http://localhost:4003");
const MENU_SERVICE_URL = process.env.MENU_SERVICE_URL || (process.env.NODE_ENV === "production" ? "http://menu-service:4007" : "http://localhost:4007");
const PURCHASE_SYNC_API_KEY = process.env.PURCHASE_SYNC_API_KEY || (process.env.NODE_ENV === "production" ? "" : "dev-only-purchase-sync-key-change-me");
const SHOPPING_UNITS = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const;
const shoppingUnitSchema = z.enum(SHOPPING_UNITS);
const menuResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    menuId: z.string().uuid(),
    familyId: z.string().uuid(),
    ingredients: z.array(z.object({
      name: z.string().trim().min(1).max(100),
      quantity: z.number().finite().positive(),
      unit: shoppingUnitSchema,
    })),
  }),
});

type ShoppingUnit = (typeof SHOPPING_UNITS)[number];
type MenuIngredient = { name: string; quantity: number; unit: ShoppingUnit };
type InventoryItem = { name: string; quantity: number; unit: ShoppingUnit; status?: string; expiryDate?: string | Date | null };
type BaseQuantity = { baseUnit: string; factor: number };

const uniqueConflict = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
const retryableTransactionConflict = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034";
export const normalizedName = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
const roundQuantity = (value: number): number => Math.round(value * 1000) / 1000;

const baseQuantity = (unit: string): BaseQuantity | null => {
  switch (unit) {
    case "KILOGRAM": return { baseUnit: "GRAM", factor: 1000 };
    case "GRAM": return { baseUnit: "GRAM", factor: 1 };
    case "LITER": return { baseUnit: "MILLILITER", factor: 1000 };
    case "MILLILITER": return { baseUnit: "MILLILITER", factor: 1 };
    case "PIECE": case "PACK": case "BOTTLE": case "CAN": case "BOX": return { baseUnit: unit, factor: 1 };
    default: return null;
  }
};

const quantityInBase = (quantity: number, unit: string): { quantity: number; baseUnit: string } | null => {
  const conversion = baseQuantity(unit);
  return conversion ? { quantity: quantity * conversion.factor, baseUnit: conversion.baseUnit } : null;
};

const quantityFromBase = (quantity: number, unit: string): number => {
  const conversion = baseQuantity(unit);
  if (!conversion) throw new AppError(400, "UNSUPPORTED_UNIT", `Unit ${unit} cannot be converted safely`);
  return roundQuantity(quantity / conversion.factor);
};

const inventoryKey = (name: string, unit: string): string | null => {
  const conversion = baseQuantity(unit);
  return conversion ? `${normalizedName(name)}|${conversion.baseUnit}` : null;
};

const isStillUsable = (item: InventoryItem, now = new Date()): boolean => {
  if (item.status === "EXPIRED" || item.status === "CONSUMED" || item.status === "DISCARDED" || item.quantity <= 0) return false;
  if (!item.expiryDate) return true;
  const expiryEnd = new Date(item.expiryDate);
  expiryEnd.setUTCHours(23, 59, 59, 999);
  return expiryEnd.getTime() >= now.getTime();
};

const getInventoryItems = async (familyId: string, authorization: string): Promise<InventoryItem[]> => {
  const allItems: InventoryItem[] = [];
  try {
    for (let page = 1; page <= 100; page += 1) {
      const response = await axios.get(`${INVENTORY_API_URL}/api/inventory/items`, {
        params: { familyId, page, limit: 100 },
        headers: { Authorization: authorization },
        timeout: 8000,
      });
      const payload = response.data as { success?: unknown; items?: unknown; pagination?: { totalPages?: unknown } };
      const paginationPages = payload.pagination?.totalPages;
      if (payload.success !== true || !Array.isArray(payload.items) || typeof paginationPages !== "number" || !Number.isInteger(paginationPages) || paginationPages < 1) {
        throw new AppError(502, "INVENTORY_CONTRACT_INVALID", "Inventory returned an invalid item list.");
      }
      allItems.push(...payload.items as InventoryItem[]);
      const totalPages = paginationPages;
      if (page >= totalPages) return allItems;
    }
    throw new AppError(502, "INVENTORY_PAGE_LIMIT", "Inventory contains too many pages to process safely.");
  } catch (error) {
    if (error instanceof AppError) throw error;
    const status = typeof error === "object" && error !== null
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;
    if (status === 401) throw new AppError(401, "INVENTORY_AUTH_REJECTED", "Inventory rejected the caller's authentication.");
    if (status === 403) throw new AppError(403, "INVENTORY_FAMILY_ACCESS_DENIED", "Inventory rejected access to this family.");
    if (status && status < 500) throw new AppError(502, "INVENTORY_CONTRACT_REJECTED", "Inventory rejected the shopping service request.");
    throw new AppError(503, "INVENTORY_SERVICE_UNAVAILABLE", "Inventory is temporarily unavailable. Retry this operation.");
  }
};

const getCurrentMenu = async (familyId: string, authorization: string) => {
  let raw: unknown;
  try {
    const response = await axios.get(`${MENU_SERVICE_URL}/api/menus/current`, {
      params: { familyId },
      headers: { Authorization: authorization },
      timeout: 8000,
    });
    raw = response.data;
  } catch (error) {
    const status = typeof error === "object" && error !== null ? (error as { response?: { status?: number } }).response?.status : undefined;
    const responseData = typeof error === "object" && error !== null
      ? (error as { response?: { data?: unknown } }).response?.data
      : undefined;
    const responseCode = typeof responseData === "object" && responseData !== null
      ? (responseData as { code?: unknown; error?: unknown }).code ?? (responseData as { error?: unknown }).error
      : undefined;
    if (status === 404 && ["CURRENT_MENU_NOT_FOUND", "MENU_NOT_FOUND"].includes(String(responseCode))) {
      throw new AppError(409, "CURRENT_MENU_NOT_FOUND", "Create or select a menu before generating a shopping list.");
    }
    if (status === 404) {
      throw new AppError(502, "MENU_CONTRACT_UNAVAILABLE", "Menu does not expose the documented current-menu endpoint yet.");
    }
    if (status === 401) throw new AppError(401, "MENU_AUTH_REJECTED", "Menu rejected the caller's authentication.");
    if (status === 403) throw new AppError(403, "MENU_FAMILY_ACCESS_DENIED", "Menu rejected access to this family.");
    if (status && status < 500) throw new AppError(502, "MENU_CONTRACT_REJECTED", "Menu rejected the documented current-menu request.");
    throw new AppError(503, "MENU_SERVICE_UNAVAILABLE", "Menu is temporarily unavailable. No shopping list was changed.");
  }

  const parsed = menuResponseSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(502, "MENU_CONTRACT_INVALID", "Menu returned an invalid current-menu response.");
  if (parsed.data.data.familyId !== familyId) throw new AppError(403, "MENU_FAMILY_MISMATCH", "Menu belongs to a different family.");
  return parsed.data.data;
};

const aggregateIngredients = (ingredients: MenuIngredient[]) => {
  const grouped = new Map<string, { name: string; unit: ShoppingUnit; baseUnit: string; factor: number; requiredBase: number }>();
  for (const ingredient of ingredients) {
    const conversion = baseQuantity(ingredient.unit);
    if (!conversion) throw new AppError(400, "UNSUPPORTED_UNIT", `Unit ${ingredient.unit} cannot be compared with inventory safely`);
    const key = inventoryKey(ingredient.name, ingredient.unit)!;
    const existing = grouped.get(key);
    if (existing) existing.requiredBase += ingredient.quantity * conversion.factor;
    else grouped.set(key, {
      name: ingredient.name.trim(), unit: ingredient.unit,
      baseUnit: conversion.baseUnit, factor: conversion.factor,
      requiredBase: ingredient.quantity * conversion.factor,
    });
  }
  return grouped;
};

const availableInventory = (items: InventoryItem[]) => {
  const available = new Map<string, number>();
  const now = new Date();
  for (const item of items) {
    if (!isStillUsable(item, now)) continue;
    const key = inventoryKey(item.name, item.unit);
    const base = quantityInBase(item.quantity, item.unit);
    if (!key || !base) continue;
    available.set(key, (available.get(key) ?? 0) + base.quantity);
  }
  return available;
};

const normalizePurchaseName = (value: string): string => normalizedName(value);
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no daylight saving

/** Vietnam calendar day `days` after today, YYYY-MM-DD (inventory expiry from catalog shelf-life days). */
export const vnDayFromToday = (days: number, now: Date = new Date()): string => {
  const date = new Date(now.getTime() + VN_OFFSET_MS);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export type PriceSnapshot = { unitPrice?: number | null; discountPercent?: number | null; productId?: string | null; imageUrl?: string | null };
export type PurchaseExtras = { categoryName?: string; expiryDate?: string };
export type CheckoutLine = { id: string; categoryName?: string; shelfLifeDays?: number };

const ADMIN_SERVICE_URL = (process.env.ADMIN_SERVICE_URL ?? "http://localhost:4011").replace(/\/+$/, "");
/**
 * Shelf-life days of the cart's catalog products (admin-service user catalog, `ids` filter): the expiry of a bought
 * item is the purchase day (Vietnam) + these days. Empty when the catalog cannot be read; the app's value is used then.
 */
export type CatalogDetails = CatalogInfo & { shelfLifeDays?: number };

/**
 * Catalog details of the given products (admin-service user catalog, up to 100 ids): shelf-life days (expiry), group
 * and piece word ("Chi tiêu"), price and running discount (cart lines without a price snapshot). Empty when the
 * catalog cannot answer (the app's values are used instead).
 */
export async function catalogDetails(userId: string, productIds: string[]): Promise<Map<string, CatalogDetails>> {
  const details = new Map<string, CatalogDetails>();
  const ids = [...new Set(productIds)].slice(0, 100);
  if (ids.length === 0) return details;
  try {
    for (let page = 1; page <= 2; page += 1) {
      const response = await axios.get(`${ADMIN_SERVICE_URL}/catalog/ingredients`, {
        params: { ids: ids.join(","), page, limit: 50 }, headers: { "x-user-id": userId }, timeout: 5000,
      });
      const body = response.data as { items?: Array<Record<string, unknown>>; totalPages?: number };
      for (const item of body.items ?? []) {
        if (typeof item.id !== "string") continue;
        details.set(item.id, {
          ...(typeof item.shelfLifeDays === "number" && Number.isInteger(item.shelfLifeDays) && item.shelfLifeDays >= 0 ? { shelfLifeDays: item.shelfLifeDays } : {}),
          group: typeof item.group === "string" && item.group.trim() ? item.group.trim() : null,
          unitLabel: typeof item.unitLabel === "string" && item.unitLabel.trim() ? item.unitLabel.trim() : null,
          price: typeof item.price === "number" ? item.price : null,
          discountPercent: typeof item.discountPercent === "number" ? item.discountPercent : null,
        });
      }
      if (page >= (body.totalPages ?? 1)) break;
    }
  } catch {
    // The app's shelfLifeDays / group are used instead.
  }
  return details;
}

export async function catalogShelfLife(userId: string, productIds: string[]): Promise<Map<string, number>> {
  const days = new Map<string, number>();
  for (const [id, detail] of await catalogDetails(userId, productIds)) if (typeof detail.shelfLifeDays === "number") days.set(id, detail.shelfLifeDays);
  return days;
}
export type CheckoutResult = {
  purchased: Array<{ id: string; name: string; inventoryItemId: string | null }>;
  failed: Array<{ id: string; name: string; code: string; message: string }>;
  listCompleted: boolean;
};

const snapshotData = (snapshot: PriceSnapshot) => ({
  ...(snapshot.unitPrice !== undefined ? { unitPrice: snapshot.unitPrice } : {}),
  ...(snapshot.discountPercent !== undefined ? { discountPercent: snapshot.discountPercent } : {}),
  ...(snapshot.productId !== undefined ? { productId: snapshot.productId } : {}),
  ...(snapshot.imageUrl !== undefined ? { imageUrl: snapshot.imageUrl } : {}),
});

export class ShoppingListService {
  static async generateFromMenu(familyId: string, authorization: string) {
    const menu = await getCurrentMenu(familyId, authorization);
    const required = aggregateIngredients(menu.ingredients);
    const inventory = menu.ingredients.length === 0
      ? new Map<string, number>()
      : availableInventory(await getInventoryItems(familyId, authorization));
    const missing = [...required.entries()].flatMap(([key, ingredient]) => {
      const missingBase = Math.max(0, ingredient.requiredBase - (inventory.get(key) ?? 0));
      if (missingBase <= 0) return [];
      return [{
        key,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: quantityFromBase(missingBase, ingredient.unit),
        note: `Thiếu cho thực đơn ${menu.menuId}`,
      }];
    });

    const persisted = await this.persistGeneratedItems(familyId, menu.menuId, missing);
    return {
      menuId: menu.menuId,
      message: menu.ingredients.length === 0
        ? "Menu hiện tại chưa có nguyên liệu để đối chiếu"
        : missing.length ? "Đã đối chiếu nguyên liệu thực đơn với kho" : "Kho đã đủ nguyên liệu cho thực đơn hiện tại",
      items: persisted.items,
      listId: persisted.list?.id ?? null,
    };
  }

  private static async persistGeneratedItems(
    familyId: string,
    menuId: string,
    missing: Array<{ key: string; name: string; unit: ShoppingUnit; quantity: number; note: string }>,
  ) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
          let list = await transaction.shoppingList.findFirst({
            where: { activeFamilyId: familyId },
            orderBy: { createdAt: "desc" },
          });
          if (!list && missing.length > 0) {
            list = await transaction.shoppingList.create({
              data: { familyId, activeFamilyId: familyId, name: "Danh sách đi chợ", status: LIST_STATUS.ACTIVE },
            });
          }
          if (!list) return { list: null, items: [] as unknown[] };

          const currentGenerated = await transaction.shoppingItem.findMany({
            where: { shoppingListId: list.id, isPurchased: false, generatedKey: { not: null } },
            select: { id: true, generatedKey: true },
          });
          const missingKeys = new Set(missing.map((item) => item.key));
          const staleIds = currentGenerated.filter((item: { id: string; generatedKey: string | null }) => item.generatedKey && !missingKeys.has(item.generatedKey)).map((item: { id: string }) => item.id);
          if (staleIds.length > 0) {
            await transaction.shoppingItem.deleteMany({ where: { id: { in: staleIds }, isPurchased: false } });
          }

          const items = [];
          for (const entry of missing) {
            const existing = await transaction.shoppingItem.findFirst({
              where: { shoppingListId: list.id, generatedKey: entry.key, isPurchased: false },
            });
            const item = existing
              ? await transaction.shoppingItem.update({
                  where: { id: existing.id },
                  data: { quantity: entry.quantity, unit: entry.unit, note: entry.note, sourceMenuId: menuId },
                })
              : await transaction.shoppingItem.create({
                  data: {
                    shoppingListId: list.id,
                    name: entry.name,
                    quantity: entry.quantity,
                    unit: entry.unit,
                    note: entry.note,
                    generatedKey: entry.key,
                    sourceMenuId: menuId,
                  },
                });
            items.push(item);
          }
          return { list, items };
        });
      } catch (error) {
        if (attempt === 0 && (uniqueConflict(error) || retryableTransactionConflict(error))) continue;
        throw error;
      }
    }
    throw new AppError(503, "SHOPPING_GENERATION_CONFLICT", "The active list changed while generating. Retry the request.");
  }

  static async list(familyId: string) {
    return prisma.shoppingList.findMany({
      where: { familyId, status: LIST_STATUS.ACTIVE },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Adds an item to the active list (Giỏ hàng). The same product (catalog id, else name) with the same unit that is
   * still in the cart only gets its quantity raised, so the cart never holds duplicates. A price snapshot from the
   * market is stored (or refreshed) on the row.
   */
  /**
   * mode "add" (Đi chợ): the same product and unit already in the cart gets the quantity added.
   * mode "atLeast" ("Cần mua tuần này"): it is raised to at least `quantity`, never added twice (idempotent).
   */
  static async addItem(data: { familyId: string; shoppingListId?: string; name: string; quantity: number; unit: string; note?: string | null } & PriceSnapshot, mode: "add" | "atLeast" = "add") {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
          let list = data.shoppingListId
            ? await transaction.shoppingList.findFirst({ where: { id: data.shoppingListId, familyId: data.familyId } })
            : await transaction.shoppingList.findFirst({ where: { activeFamilyId: data.familyId }, orderBy: { createdAt: "desc" } });
          if (data.shoppingListId && !list) throw new AppError(404, "LIST_NOT_FOUND", "Shopping list not found");
          if (list && list.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
          if (!list) {
            list = await transaction.shoppingList.create({
              data: { familyId: data.familyId, activeFamilyId: data.familyId, name: "Danh sách đi chợ", status: LIST_STATUS.ACTIVE },
            });
          }
          const inCart = await transaction.shoppingItem.findMany({
            // Cart lines only: never a line already in an order.
            where: { shoppingListId: list.id, unit: data.unit, isPurchased: false, inventoryAppliedAt: null, purchaseId: null },
          });
          const key = normalizedName(data.name);
          const existing = inCart.find((item) =>
            (data.productId && item.productId ? item.productId === data.productId : normalizedName(item.name) === key));
          if (existing) {
            const quantity = mode === "atLeast" ? Math.max(existing.quantity, data.quantity) : existing.quantity + data.quantity;
            return transaction.shoppingItem.update({
              where: { id: existing.id },
              // kg lines stay on the 0.1 kg grid and at most 20 kg (lib/quantity-rule).
              data: { quantity: roundQuantity(mergedQuantity(quantity, data.unit)), ...snapshotData(data) },
            });
          }
          return transaction.shoppingItem.create({
            data: {
              shoppingListId: list.id,
              name: data.name,
              quantity: data.quantity,
              unit: data.unit,
              note: data.note,
              ...snapshotData(data),
            },
          });
        });
      } catch (error) {
        if (attempt === 0 && (uniqueConflict(error) || retryableTransactionConflict(error))) continue;
        throw error;
      }
    }
    throw new AppError(503, "SHOPPING_LIST_CONFLICT", "The active list changed while adding the item. Retry the request.");
  }

  /**
   * "Thêm vào Giỏ hàng" from "Cần mua tuần này": puts every item in the family's cart with at least the given
   * quantity (same product and unit: raised, not doubled; otherwise added). Running it again changes nothing.
   */
  static async ensureItems(familyId: string, items: Array<{ name: string; quantity: number; unit: string } & PriceSnapshot>) {
    const results = [];
    for (const item of items) results.push(await this.addItem({ familyId, ...item }, "atLeast"));
    return results;
  }

  static async getSuggestions(familyId: string, authorization: string) {
    const consumptionEvents: unknown[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let historyComplete = false;
    try {
      for (let page = 0; page < 100; page += 1) {
        const response = await axios.get(`${INVENTORY_API_URL}/api/inventory/consumption`, {
          params: { familyId, days: 90, limit: 250, ...(cursor ? { cursor } : {}) },
          headers: { Authorization: authorization },
          timeout: 8000,
        });
        const payload = response.data as {
          success?: unknown;
          data?: {
            events?: unknown;
            windowDays?: unknown;
            pagination?: { hasMore?: unknown; nextCursor?: unknown };
          };
        };
        const pagination = payload.data?.pagination;
        if (payload.success !== true || !Array.isArray(payload.data?.events) || payload.data.windowDays !== 90
          || typeof pagination?.hasMore !== "boolean"
          || (pagination.hasMore && typeof pagination.nextCursor !== "string")
          || (pagination.hasMore && !z.string().uuid().safeParse(pagination.nextCursor).success)
          || (!pagination.hasMore && pagination.nextCursor !== null)) {
          throw new AppError(502, "CONSUMPTION_CONTRACT_INVALID", "Inventory returned an invalid or incomplete consumption history response.");
        }
        consumptionEvents.push(...payload.data.events);
        if (!pagination.hasMore) {
          historyComplete = true;
          break;
        }
        const nextCursor = pagination.nextCursor as string;
        if (seenCursors.has(nextCursor) || nextCursor === cursor) {
          throw new AppError(502, "CONSUMPTION_CURSOR_INVALID", "Inventory repeated a consumption history cursor.");
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }
      if (!historyComplete) {
        throw new AppError(503, "CONSUMPTION_HISTORY_LIMIT", "Consumption history exceeded the safe processing limit; retry with a smaller history window.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      const status = typeof error === "object" && error !== null
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
      if (status === 401) throw new AppError(401, "INVENTORY_AUTH_REJECTED", "Inventory rejected the caller's authentication.");
      if (status === 403) throw new AppError(403, "INVENTORY_FAMILY_ACCESS_DENIED", "Inventory rejected access to this family.");
      if (status && status < 500) throw new AppError(502, "CONSUMPTION_CONTRACT_REJECTED", "Inventory rejected the consumption history request.");
      throw new AppError(503, "CONSUMPTION_HISTORY_UNAVAILABLE", "Consumption history is temporarily unavailable.");
    }
    const inventoryItems = await getInventoryItems(familyId, authorization);
    const available = availableInventory(inventoryItems);
    const groups = new Map<string, {
      name: string; unit: ShoppingUnit; baseUnit: string; factor: number;
      consumedBase: number; events: number; lastConsumedAt: Date;
    }>();
    for (const raw of consumptionEvents) {
      const event = raw as { name?: unknown; unit?: unknown; quantity?: unknown; consumedAt?: unknown };
      if (typeof event.name !== "string" || typeof event.unit !== "string" || typeof event.quantity !== "number" || !Number.isFinite(event.quantity) || event.quantity <= 0) continue;
      const parsedUnit = shoppingUnitSchema.safeParse(event.unit);
      const conversion = parsedUnit.success ? baseQuantity(parsedUnit.data) : null;
      const consumedAt = typeof event.consumedAt === "string" || event.consumedAt instanceof Date ? new Date(event.consumedAt) : null;
      if (!parsedUnit.success || !conversion || !consumedAt || Number.isNaN(consumedAt.getTime())) continue;
      const key = inventoryKey(event.name, parsedUnit.data)!;
      const current = groups.get(key);
      if (current) {
        current.consumedBase += event.quantity * conversion.factor;
        current.events += 1;
        if (consumedAt > current.lastConsumedAt) current.lastConsumedAt = consumedAt;
      } else {
        groups.set(key, {
          name: event.name.trim(), unit: parsedUnit.data, baseUnit: conversion.baseUnit,
          factor: conversion.factor, consumedBase: event.quantity * conversion.factor,
          events: 1, lastConsumedAt: consumedAt,
        });
      }
    }

    const windowDays = 90;
    const coverDays = 14;
    return [...groups.entries()].map(([key, group]) => {
      const dailyRateBase = group.consumedBase / windowDays;
      const projectedBase = dailyRateBase * coverDays;
      const availableBase = available.get(key) ?? 0;
      const suggestedBase = Math.max(0, projectedBase - availableBase);
      return {
        name: group.name,
        unit: group.unit,
        suggestedQuantity: quantityFromBase(suggestedBase, group.unit),
        consumedQuantity: quantityFromBase(group.consumedBase, group.unit),
        availableQuantity: quantityFromBase(availableBase, group.unit),
        dailyConsumption: quantityFromBase(dailyRateBase, group.unit),
        periodDays: coverDays,
        historyDays: windowDays,
        consumptionEvents: group.events,
        lastConsumedAt: group.lastConsumedAt.toISOString(),
      };
    }).filter((suggestion) => suggestion.suggestedQuantity > 0)
      .sort((a, b) => b.dailyConsumption - a.dailyConsumption)
      .slice(0, 5);
  }

  static async updateItem(id: string, familyId: string, data: UpdateItemBody) {
    const item = await prisma.shoppingItem.findFirst({
      where: { id, shoppingList: { familyId } },
      select: { isPurchased: true, purchaseId: true, unit: true, productId: true, shoppingList: { select: { status: true } } },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    if (item.isPurchased) throw new AppError(409, "ITEM_ALREADY_PURCHASED", "Purchased items cannot be changed");
    if (item.purchaseId) throw new AppError(409, "ITEM_ORDERED", "Ordered items cannot be changed");
    // Same quantity rule as adding (kg in 0.1 steps up to 20; catalog count units whole), checked on the line's unit.
    const problem = data.quantity === undefined ? null : quantityProblem(data.quantity, item.unit, Boolean(item.productId));
    if (problem) throw new AppError(400, "INVALID_QUANTITY", problem);
    return prisma.shoppingItem.update({ where: { id }, data });
  }

  static async removeItem(id: string, familyId: string) {
    const item = await prisma.shoppingItem.findFirst({
      where: { id, shoppingList: { familyId } },
      select: { isPurchased: true, purchaseId: true, shoppingList: { select: { status: true } } },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    if (item.isPurchased) throw new AppError(409, "ITEM_ALREADY_PURCHASED", "Purchased items cannot be removed");
    if (item.purchaseId) throw new AppError(409, "ITEM_ORDERED", "Ordered items cannot be removed");
    await prisma.shoppingItem.delete({ where: { id } });
  }

  static async confirmPurchase(id: string, familyId: string, userId: string, extras: PurchaseExtras = {}) {
    const item = await prisma.shoppingItem.findFirst({
      where: { id, shoppingList: { familyId } },
      include: { shoppingList: { select: { status: true } } },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
    if (item.isPurchased && item.inventoryAppliedAt) {
      return { item, inventoryItemId: item.inventoryItemId, alreadyApplied: true, alreadyPurchased: true };
    }
    // A line in a delivery order reaches Kho when the order is delivered, not here.
    if (item.purchaseId) throw new AppError(409, "ITEM_ORDERED", "This item is in a delivery order.");
    if (item.shoppingList.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
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
          // Market products: inventory keeps the catalog id so Kho can show the product image (exact match).
          ...(item.productId ? { productId: item.productId } : {}),
          ...(extras.categoryName ? { categoryName: extras.categoryName } : {}),
          ...(extras.expiryDate ? { expiryDate: extras.expiryDate } : {}),
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
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.shoppingItem.findFirst({ where: { id, shoppingList: { familyId } } });
      if (!current) throw new AppError(404, "NOT_FOUND", "Shopping item not found");
      if (current.isPurchased && current.inventoryAppliedAt) return current;
      const updated = await transaction.shoppingItem.update({
        where: { id },
        data: {
          isPurchased: true,
          inventoryAppliedAt: current.inventoryAppliedAt ?? new Date(),
          inventoryItemId: current.inventoryItemId ?? syncedInventoryItemId,
          generatedKey: null,
        },
      });
      await transaction.purchaseHistory.upsert({
        where: { shoppingItemId: id },
        create: {
          familyId,
          itemKey: normalizePurchaseName(item.name),
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          shoppingItemId: id,
        },
        update: {
          familyId,
          itemKey: normalizePurchaseName(item.name),
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          purchasedAt: new Date(),
        },
      });
      return updated;
    });

    return {
      item: result,
      inventoryItemId: result.inventoryItemId,
      alreadyApplied: inventoryResult.data?.alreadyApplied ?? false,
      alreadyPurchased: item.isPurchased,
    };
  }

  static async complete(id: string, familyId: string) {
    const list = await prisma.shoppingList.findFirst({ where: { id, familyId }, select: { status: true } });
    if (!list) throw new AppError(404, "NOT_FOUND", "Shopping list not found");
    if (list.status !== LIST_STATUS.ACTIVE) throw new AppError(409, "LIST_NOT_ACTIVE", "Shopping list is not active");
    return prisma.shoppingList.update({
      where: { id },
      data: { status: LIST_STATUS.COMPLETED, activeFamilyId: null },
      include: { items: true },
    });
  }
}
