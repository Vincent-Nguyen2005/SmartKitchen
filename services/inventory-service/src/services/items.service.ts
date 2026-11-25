import { prisma } from "../lib/prisma";
import { normalizeName } from "../lib/names";
import { PhotoStorage, managedPhotoFileName } from "./photo-storage.service";
import {
  CreateItemInput,
  UpdateItemInput,
  ListItemsQuery,
} from "../validators/items.validator";

type CategoryClient = Pick<typeof prisma, "category">;

/** Category id for a free-text group name, creating the category on first use. */
const resolveCategoryId = async (client: CategoryClient, name: string | undefined): Promise<string | undefined> => {
  if (!name) return undefined;
  const category = await client.category.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
  return category.id;
};

/** Statuses an added quantity may join: not expired or thrown away (a consumed row is revived as fresh). */
export const MERGEABLE_STATUSES = ["FRESH", "NEAR_EXPIRY", "CONSUMED"] as const;
const httpError = (statusCode: number, code: string, message: string) => Object.assign(new Error(message), { statusCode, code });
/** Same default window as GET /alerts/expiring (alerts.validator `days`). */
export const NEAR_EXPIRY_DAYS = 3;

/** Status from an expiry day, by the same rule as AlertsService.updateExpiringStatus (UTC calendar days). */
export function statusForExpiry(expiryDate: Date | null | undefined, now: Date = new Date(), days = NEAR_EXPIRY_DAYS): "FRESH" | "NEAR_EXPIRY" | "EXPIRED" {
  if (!expiryDate) return "FRESH";
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const threshold = new Date(today);
  threshold.setUTCDate(threshold.getUTCDate() + days);
  threshold.setUTCHours(23, 59, 59, 999);
  const expiryDay = new Date(expiryDate);
  expiryDay.setUTCHours(0, 0, 0, 0);
  return expiryDay < today ? "EXPIRED" : expiryDay <= threshold ? "NEAR_EXPIRY" : "FRESH";
}

/**
 * Kho rows bought in Đi chợ (origin PURCHASE) keep the market's name, unit, quantity and expiry: a manual update that
 * changes one of them is refused (the quantity then changes only through cooking and Cộng thêm / purchase merges).
 * Storage place, photo and group stay editable, and the row can still be discarded or deleted.
 */
export const LOCKED_PURCHASE_FIELDS = ["name", "unit", "quantity", "expiryDate"] as const;
const sameDay = (left: Date | string | null | undefined, right: Date | string | null | undefined): boolean =>
  (left ? new Date(left).getTime() : null) === (right ? new Date(right).getTime() : null);
/** Locked fields this update would change on a PURCHASE row (unchanged values sent back by the form are fine). */
export function lockedChanges(previous: { origin?: string; name: string; unit: string; quantity: number; expiryDate: Date | null }, data: Partial<UpdateItemInput>): string[] {
  if (previous.origin !== "PURCHASE") return [];
  const changed: string[] = [];
  if (data.name !== undefined && data.name.trim() !== previous.name) changed.push("name");
  if (data.unit !== undefined && data.unit !== previous.unit) changed.push("unit");
  if (data.quantity !== undefined && data.quantity !== previous.quantity) changed.push("quantity");
  if (data.expiryDate !== undefined && !sameDay(data.expiryDate, previous.expiryDate)) changed.push("expiryDate");
  return changed;
}
const lockedError = (fields: string[]) => httpError(409, "PURCHASED_ITEM_LOCKED", `Items bought in Đi chợ keep their ${fields.join(", ")}; delete or discard the item instead.`);

export type DuplicateMatch = {
  /** Oldest live row of the same product (same productId, or same normalized name) with the same unit. */
  sameUnit: Awaited<ReturnType<typeof prisma.foodItem.findFirst>>;
  /** Live rows of the same product in another unit (a new row is created for them, no unit conversion). */
  otherUnits: number;
};

export class ItemsService {
  /**
   * `productId`: the admin catalog product matched from the name by the caller (catalog-match.service); null when the
   * name matches no product. The server decides it, never the client.
   */
  static async create(data: CreateItemInput, productId: string | null = null) {
    const categoryId = data.categoryId ?? await resolveCategoryId(prisma, data.categoryName);
    return prisma.foodItem.create({
      data: {
        familyId: data.familyId,
        name: data.name,
        productId,
        description: data.description,
        quantity: data.quantity,
        unit: data.unit,
        minQuantity: data.minQuantity,
        categoryId,
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

    // Used-up rows (CONSUMED, quantity 0) are hidden unless asked for by status; they stay in the database so
    // "Cộng thêm" can restart them as a fresh batch (findDuplicate) and consumption history keeps their logs.
    const where: any = { deletedAt: null, ...filters, status: filters.status ?? { not: "CONSUMED" } };
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

  /**
   * Existing Kho rows of the same product in this family: same productId, or the same normalized name (older rows
   * have no productId). Only live rows that new stock may join (not expired, discarded or deleted).
   */
  static async findDuplicate(familyId: string, match: { name: string; productId: string | null; unit: string }): Promise<DuplicateMatch> {
    const key = normalizeName(match.name);
    const rows = await prisma.foodItem.findMany({
      where: { familyId, deletedAt: null, status: { in: [...MERGEABLE_STATUSES] } },
      orderBy: { createdAt: "asc" },
      include: { category: true },
    });
    const same = rows.filter((row) => (match.productId !== null && row.productId === match.productId) || (key.length > 0 && normalizeName(row.name) === key));
    return { sameUnit: same.find((row) => row.unit === match.unit) ?? null, otherUnits: same.filter((row) => row.unit !== match.unit).length };
  }

  /**
   * "Cộng thêm", only with the same unit (409 UNIT_MISMATCH otherwise; no unit conversion). The row's productId,
   * photo and name are untouched.
   * - Fresh / near-expiry row: adds `quantity` atomically (SQL increment). Expiry: the earlier of the two dates is
   *   kept (the row then warns by its oldest stock; a later date never hides an earlier one); a row without expiry
   *   takes the new date.
   * - Consumed row ("đã dùng hết"): becomes a fresh batch and inherits nothing stale: quantity = the new quantity,
   *   expiry = the new expiry (or none), status computed from that expiry.
   */
  static async addQuantity(id: string, familyId: string, input: { quantity: number; unit: string; expiryDate?: Date }, userId: string) {
    return prisma.$transaction(async (transaction) => {
      const previous = await transaction.foodItem.findFirst({ where: { id, familyId, deletedAt: null } });
      if (!previous) throw new Error("Item not found");
      if (!(MERGEABLE_STATUSES as readonly string[]).includes(previous.status)) {
        throw httpError(409, "ITEM_NOT_MERGEABLE", "This item is expired or discarded; add a new row instead.");
      }
      if (previous.unit !== input.unit) throw httpError(409, "UNIT_MISMATCH", "Units differ; add a new row instead.");
      const consumed = previous.status === "CONSUMED";
      // A used-up bought row restarted by hand holds only manual stock now: it becomes an editable manual row.
      const becomesManual = consumed && previous.origin === "PURCHASE";
      const keepEarlier = input.expiryDate && (!previous.expiryDate || input.expiryDate < previous.expiryDate);
      const changed = await transaction.foodItem.updateMany({
        // The status is part of the condition, so a row that changed meanwhile is not merged with the wrong rule.
        where: { id, familyId, deletedAt: null, unit: input.unit, status: previous.status },
        data: consumed
          ? { quantity: input.quantity, expiryDate: input.expiryDate ?? null, status: statusForExpiry(input.expiryDate), ...(becomesManual ? { origin: "MANUAL" as const, purchasedAt: null } : {}) }
          : { quantity: { increment: input.quantity }, ...(keepEarlier ? { expiryDate: input.expiryDate } : {}) },
      });
      if (changed.count !== 1) throw httpError(409, "ITEM_CHANGED", "The item changed meanwhile; try again.");
      const updated = await transaction.foodItem.findFirst({ where: { id, familyId, deletedAt: null }, include: { category: true } });
      if (!updated) throw new Error("Item not found");
      await transaction.inventoryLog.create({
        data: {
          itemId: id,
          action: "MANUAL_MERGE",
          oldValue: { quantity: previous.quantity, unit: previous.unit, status: previous.status },
          newValue: { quantity: updated.quantity, unit: updated.unit, status: updated.status },
          note: consumed
            ? `Restocked a used-up item with ${input.quantity} ${input.unit} as a new batch (user chose "Cộng thêm")`
            : `Added ${input.quantity} ${input.unit} to an existing item (user chose "Cộng thêm")`,
          createdBy: userId,
        },
      });
      return updated;
    });
  }

  /**
   * `product`: the catalog product matched from a NEW name (renames only): a product sets productId, null clears it,
   * undefined (no rename, or catalog unreachable) leaves it as it is.
   */
  static async update(id: string, familyId: string, data: UpdateItemInput, userId?: string, product?: { id: string } | null) {
    let replacedImageUrl: string | null = null;
    const result = await prisma.$transaction(async (transaction) => {
      const previous = await transaction.foodItem.findFirst({
        where: { id, familyId, deletedAt: null },
      });
      if (!previous) throw new Error("Item not found");
      const locked = lockedChanges(previous, data);
      if (locked.length > 0) throw lockedError(locked);
      if (data.imageUrl !== undefined && data.imageUrl !== previous.imageUrl && managedPhotoFileName(previous.imageUrl)) {
        replacedImageUrl = previous.imageUrl;
      }

      const { categoryName, ...fields } = data;
      const updateData: Omit<UpdateItemInput, "categoryName"> & { productId?: string | null } = { ...fields };
      if (product !== undefined) updateData.productId = product?.id ?? null;
      if (categoryName && !fields.categoryId) updateData.categoryId = await resolveCategoryId(transaction, categoryName);
      if (typeof data.quantity === "number" && data.quantity > 0 && previous.status === "CONSUMED" && data.status === undefined) {
        updateData.status = "FRESH";
      }
      // Quantity 0: the row is used up and leaves the Kho list.
      if (data.quantity === 0 && data.status === undefined) updateData.status = "CONSUMED";
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
    // An uploaded photo replaced by an external image URL is no longer reachable; remove its file.
    if (replacedImageUrl) await PhotoStorage.removeByUrl(replacedImageUrl);
    return result;
  }

  static async consume(id: string, familyId: string, quantity: number, userId: string) {
    return prisma.$transaction(async (transaction) => {
      const previous = await transaction.foodItem.findFirst({
        where: { id, familyId, deletedAt: null },
      });
      if (!previous) throw new Error("Item not found");
      if (previous.origin === "PURCHASE") throw lockedError(["quantity"]);
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
    const item = await this.getById(id, familyId);
    const deleted = await prisma.foodItem.update({
      where: { id },
      data: { deletedAt: new Date(), imageUrl: null },
    });
    await PhotoStorage.removeByUrl(item.imageUrl);
    return deleted;
  }
}
