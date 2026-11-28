import { prisma } from "../lib/prisma";
import { normalizeName } from "../lib/names";
import type { CatalogLabel } from "./photo-recognition/catalog-labels";
import { matchCatalogProduct } from "./catalog-match.service";
import { isExpiredForUse, usableInKhoFilter } from "../lib/kho-expiry";

/**
 * "Đã ăn" in Nấu ăn: the dish's ingredients (already scaled to the family by the app) are taken out of Kho.
 * - Rows of the same product: same catalog productId, or the same normalized name (Kho rows without productId).
 * - Units: g with kg, ml with l; a product sold in packs / pieces with a known weight (catalog packGrams: grams,
 *   ml for a bottle) also converts between its own unit and grams / ml (recipe "150 g Hành lá" from "2 bó").
 *   Other units are not converted (that row is skipped; the shortfall is reported).
 * - FEFO: rows that expire first are used first (rows without expiry last, then the oldest row).
 * - Only usable rows (FRESH / NEAR_EXPIRY, quantity > 0); expired food is never taken.
 * - A row reaching 0 becomes CONSUMED and leaves the Kho list. Each change writes a CONSUMPTION log (same shape as
 *   the old "Đã dùng"), so consumption history and buying suggestions keep working.
 * - Idempotent per cookId: a retried request changes nothing.
 */
export type CookLine = { name: string; quantity: number; unit: string };
export type CookLineResult = { name: string; quantity: number; unit: string; used: number; missing: number };
export type CookResult = { alreadyApplied: boolean; lines: CookLineResult[] };
export type KhoRow = { id: string; name: string; productId: string | null; quantity: number; unit: string; status: string; expiryDate: Date | null; createdAt: Date };

const UNIT_ALIASES: Record<string, string> = { g: "GRAM", gram: "GRAM", kg: "KILOGRAM", ml: "MILLILITER", l: "LITER", "lít": "LITER" };
const unitCode = (unit: string): string => UNIT_ALIASES[unit.trim().toLowerCase()] ?? unit.trim().toUpperCase();
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const USABLE = ["FRESH", "NEAR_EXPIRY"];

/** Measure and size in its base unit (g / ml / the piece unit itself); packs and pieces with a weight become mass. */
export function measureFor(unit: string, product: Pick<CatalogLabel, "unit" | "packGrams"> | null): { measure: string; factor: number } {
  const code = unitCode(unit);
  switch (code) {
    case "GRAM": return { measure: "MASS", factor: 1 };
    case "KILOGRAM": return { measure: "MASS", factor: 1000 };
    case "MILLILITER": return { measure: "VOLUME", factor: 1 };
    case "LITER": return { measure: "VOLUME", factor: 1000 };
    default:
      if (product?.packGrams && product.packGrams > 0 && product.unit && unitCode(product.unit) === code) {
        return { measure: code === "BOTTLE" ? "VOLUME" : "MASS", factor: product.packGrams };
      }
      return { measure: code, factor: 1 };
  }
}

/** First expiry first; rows without expiry after dated ones; then the oldest row. */
export const fefo = (left: KhoRow, right: KhoRow): number =>
  (left.expiryDate ? left.expiryDate.getTime() : Number.POSITIVE_INFINITY) - (right.expiryDate ? right.expiryDate.getTime() : Number.POSITIVE_INFINITY)
  || left.createdAt.getTime() - right.createdAt.getTime();

/**
 * The deduction plan for one ingredient (pure): new quantity per row, in FEFO order, and the amount still missing
 * in the ingredient's own unit.
 */
export function planDeduction(line: CookLine, rows: KhoRow[], product: CatalogLabel | null): { changes: Array<{ row: KhoRow; quantity: number }>; used: number; missing: number } {
  const need = measureFor(line.unit, product);
  const key = normalizeName(line.name);
  const productKey = product ? normalizeName(product.name) : null;
  const candidates = rows
    .filter((row) => USABLE.includes(row.status) && row.quantity > 0)
    .filter((row) => (product !== null && row.productId === product.id) || normalizeName(row.name) === key || (productKey !== null && normalizeName(row.name) === productKey))
    .filter((row) => measureFor(row.unit, product).measure === need.measure)
    .sort(fefo);
  let remaining = line.quantity * need.factor;
  const changes: Array<{ row: KhoRow; quantity: number }> = [];
  for (const row of candidates) {
    if (remaining <= 1e-9) break;
    const { factor } = measureFor(row.unit, product);
    const available = row.quantity * factor;
    const take = Math.min(available, remaining);
    remaining -= take;
    const left = round3((available - take) / factor);
    changes.push({ row, quantity: left <= 1e-6 ? 0 : left });
  }
  const missing = round3(Math.max(0, remaining) / need.factor);
  return { changes, used: round3(line.quantity - missing), missing };
}

const conflict = () => Object.assign(new Error("Kho changed while cooking; try again"), { statusCode: 409, code: "COOK_CONFLICT" });

export class CookService {
  static async cook(input: { familyId: string; cookId: string; dishName?: string; lines: CookLine[] }, catalog: CatalogLabel[], userId: string): Promise<CookResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.cookOnce(input, catalog, userId);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2002") return { alreadyApplied: true, lines: [] };
        if (code === "COOK_CONFLICT" && attempt === 0) continue;
        throw error;
      }
    }
  }

  private static async cookOnce(input: { familyId: string; cookId: string; dishName?: string; lines: CookLine[] }, catalog: CatalogLabel[], userId: string): Promise<CookResult> {
    return prisma.$transaction(async (transaction) => {
      // Created first: a second request with the same cookId fails here (P2002) before touching Kho.
      await transaction.cookApplication.create({ data: { cookId: input.cookId, familyId: input.familyId } });
      const loaded: KhoRow[] = await transaction.foodItem.findMany({
        // Never expired rows (past their expiry day, whatever their stored status or origin; lib/kho-expiry.ts).
        // Nor "Đang giao" rows (not delivered yet).
        where: { familyId: input.familyId, deletedAt: null, deliveryOrderId: null, status: { in: USABLE as never }, quantity: { gt: 0 }, ...usableInKhoFilter() },
        select: { id: true, name: true, productId: true, quantity: true, unit: true, status: true, expiryDate: true, createdAt: true },
      });
      // Same rule on the loaded rows (the query already leaves them out; Vietnam midnight may pass in between).
      const rows = loaded.filter((row) => !isExpiredForUse(row));
      const lines: CookLineResult[] = [];
      for (const line of input.lines) {
        const product = matchCatalogProduct(line.name, catalog);
        const plan = planDeduction(line, rows, product);
        for (const { row, quantity } of plan.changes) {
          const status = quantity === 0 ? "CONSUMED" : row.status;
          // Only if the row still has what was read: an overlapping change retries the whole dish once.
          const changed = await transaction.foodItem.updateMany({
            where: { id: row.id, familyId: input.familyId, deletedAt: null, quantity: row.quantity, status: row.status as never },
            data: { quantity, status: status as never },
          });
          if (changed.count !== 1) throw conflict();
          await transaction.inventoryLog.create({
            data: {
              itemId: row.id,
              action: "CONSUMPTION",
              oldValue: { quantity: row.quantity, unit: row.unit, status: row.status },
              newValue: { quantity, unit: row.unit, status },
              note: `Cooked${input.dishName ? ` "${input.dishName.slice(0, 80)}"` : ""}: used ${round3(row.quantity - quantity)} ${row.unit}`,
              createdBy: userId,
            },
          });
          // Later lines of the same dish see what is left.
          row.quantity = quantity;
          row.status = status;
        }
        lines.push({ name: line.name, quantity: line.quantity, unit: line.unit, used: plan.used, missing: plan.missing });
      }
      return { alreadyApplied: false, lines };
    });
  }
}
