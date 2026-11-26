import { prisma } from "../lib/prisma";
import { AppError } from "../lib/app-error";

/**
 * "Chi tiêu": what a family spent in Đi chợ, from completed purchases only.
 * - A purchase is one "Mua" in Giỏ hàng (or one single-item purchase): only the lines that reached Kho belong to it;
 *   lines that failed stay in the cart and are never counted. There is no payment step in Đi chợ (payment-service is
 *   not involved), so "completed" = the line is in Kho (isPurchased with inventoryAppliedAt).
 * - Prices are the checkout's: paid unit price = round(unitPrice × (100 − discount%) / 100), line total =
 *   round(paid × quantity) in whole VND, purchase total = sum of the rounded line totals (lines without a price: 0).
 *   Snapshotted on the line when it is bought, so later catalog price changes do not rewrite history.
 * - Months are Vietnam calendar months (Asia/Ho_Chi_Minh = UTC+7, no daylight saving).
 */
export type CatalogInfo = { group?: string | null; unitLabel?: string | null; price?: number | null; discountPercent?: number | null };

const VN_OFFSET_MS = 7 * 3_600_000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MAX_GROUPS = 6;
export const OTHER_GROUP = "Khác";

export const paidUnitPrice = (unitPrice: number, discountPercent: number | null | undefined): number =>
  Math.round((unitPrice * (100 - (discountPercent ?? 0))) / 100);
export const lineTotalOf = (paid: number | null, quantity: number): number | null =>
  paid === null || !Number.isFinite(quantity) ? null : Math.round(paid * quantity);

/** The Vietnam month (YYYY-MM) of `now`. */
export const vnMonth = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 7);

/** [from, to) in UTC for a Vietnam month: 2026-11 → 2026-10-31T17:00Z .. 2026-11-30T17:00Z. */
export const vnMonthRange = (month: string): { from: Date; to: Date } => {
  const match = MONTH.exec(month);
  if (!match) throw new AppError(400, "INVALID_MONTH", "month must be YYYY-MM");
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { from: new Date(Date.UTC(year, index, 1) - VN_OFFSET_MS), to: new Date(Date.UTC(year, index + 1, 1) - VN_OFFSET_MS) };
};

export const previousMonth = (month: string): string => {
  const { from } = vnMonthRange(month);
  return vnMonth(new Date(from.getTime() - 1));
};

/** Whole-number % change; null when the previous month had no spending. */
export const changePercent = (total: number, previous: number): number | null =>
  previous > 0 ? Math.round(((total - previous) / previous) * 100) : null;

type GroupLine = { lineTotal: number | null; groupName: string | null };
/** Amount per catalog group (no group → "Khác"), sorted by amount; beyond the top 6 merged into "Khác". */
export const groupTotals = (lines: GroupLine[]): Array<{ name: string; amount: number; percent: number }> => {
  const sums = new Map<string, number>();
  for (const line of lines) {
    if (!line.lineTotal) continue;
    const name = line.groupName?.trim() || OTHER_GROUP;
    sums.set(name, (sums.get(name) ?? 0) + line.lineTotal);
  }
  const total = [...sums.values()].reduce((sum, amount) => sum + amount, 0);
  const named = [...sums].filter(([name]) => name !== OTHER_GROUP).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "vi"));
  const top = named.slice(0, MAX_GROUPS);
  const other = (sums.get(OTHER_GROUP) ?? 0) + named.slice(MAX_GROUPS).reduce((sum, [, amount]) => sum + amount, 0);
  const rows = [...top, ...(other > 0 ? [[OTHER_GROUP, other] as [string, number]] : [])];
  return rows.map(([name, amount]) => ({ name, amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0 }));
};

/**
 * Records one purchase for the lines that were just bought (in Kho, not yet in a purchase): snapshots the paid unit
 * price, line total, group and piece word, and stores buyer, time, total and item count. Idempotent: lines already in
 * a purchase are skipped; nothing to record → null. Every new purchase has a buyer: without one it is refused (400).
 */
export async function recordPurchase(familyId: string, buyerUserId: string, itemIds: string[], catalog: Map<string, CatalogInfo>, now: Date = new Date()): Promise<{ id: string; total: number; itemCount: number } | null> {
  if (typeof buyerUserId !== "string" || !buyerUserId.trim()) throw new AppError(400, "BUYER_REQUIRED", "A purchase needs the buyer.");
  if (itemIds.length === 0) return null;
  return prisma.$transaction(async (transaction) => {
    const items = await transaction.shoppingItem.findMany({
      where: { id: { in: itemIds }, purchaseId: null, isPurchased: true, inventoryAppliedAt: { not: null }, shoppingList: { familyId } },
      select: { id: true, quantity: true, unitPrice: true, discountPercent: true, productId: true },
    });
    if (items.length === 0) return null;
    const lines = items.map((item) => {
      const info = item.productId ? catalog.get(item.productId) : undefined;
      // The cart's price: the snapshot taken when added; else the catalog's current price (as the cart showed it).
      const unitPrice = item.unitPrice ?? (typeof info?.price === "number" ? info.price : null);
      const discountPercent = item.unitPrice !== null ? item.discountPercent : info?.discountPercent ?? null;
      const paid = unitPrice === null ? null : paidUnitPrice(unitPrice, discountPercent);
      return { item, unitPrice, discountPercent, paid, lineTotal: lineTotalOf(paid, item.quantity), info };
    });
    const total = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
    const purchase = await transaction.purchase.create({ data: { familyId, buyerUserId, purchasedAt: now, total, itemCount: lines.length } });
    for (const line of lines) {
      await transaction.shoppingItem.update({
        where: { id: line.item.id },
        data: {
          purchaseId: purchase.id,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          paidUnitPrice: line.paid,
          lineTotal: line.lineTotal,
          groupName: line.info?.group ?? null,
          unitLabel: line.info?.unitLabel ?? null,
        },
      });
    }
    return { id: purchase.id, total, itemCount: lines.length };
  });
}

export type SpendingLine = {
  id: string; name: string; quantity: number; unit: string; unitLabel: string | null;
  unitPrice: number | null; originalUnitPrice: number | null; discountPercent: number | null; lineTotal: number | null; group: string;
};
export type SpendingPurchase = { id: string; purchasedAt: string; buyerUserId: string | null; itemCount: number; total: number; lines: SpendingLine[] };
export type MonthSpending = {
  month: string; previousMonth: string; total: number; previousTotal: number; changePercent: number | null; purchaseCount: number;
  groups: Array<{ name: string; amount: number; percent: number }>;
  purchases: { items: SpendingPurchase[]; page: number; limit: number; total: number };
};

type CatalogLookup = (productIds: string[]) => Promise<Map<string, CatalogInfo>>;

/**
 * The month summary and purchase list of a family (newest first; the list is paginated, the totals and groups cover
 * the whole month). Lines bought before snapshots existed take their group / piece word from the catalog now.
 */
export async function monthSpending(familyId: string, month: string, options: { page?: number; limit?: number; catalog?: CatalogLookup } = {}): Promise<MonthSpending> {
  const range = vnMonthRange(month);
  const before = previousMonth(month);
  const previousRange = vnMonthRange(before);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 50)));
  const where = { familyId, purchasedAt: { gte: range.from, lt: range.to } };
  const [sum, previous, count, lineRows, purchases] = await Promise.all([
    prisma.purchase.aggregate({ where, _sum: { total: true } }),
    prisma.purchase.aggregate({ where: { familyId, purchasedAt: { gte: previousRange.from, lt: previousRange.to } }, _sum: { total: true } }),
    prisma.purchase.count({ where }),
    prisma.shoppingItem.findMany({ where: { purchase: where }, select: { lineTotal: true, groupName: true, productId: true } }),
    prisma.purchase.findMany({
      where, orderBy: { purchasedAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { items: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, quantity: true, unit: true, unitLabel: true, unitPrice: true, discountPercent: true, paidUnitPrice: true, lineTotal: true, groupName: true, productId: true } } },
    }),
  ]);
  const missing = [...new Set([...lineRows, ...purchases.flatMap((purchase) => purchase.items)].filter((line) => line.productId && !line.groupName).map((line) => line.productId as string))];
  const catalog = missing.length > 0 && options.catalog ? await options.catalog(missing).catch(() => new Map<string, CatalogInfo>()) : new Map<string, CatalogInfo>();
  const groupOf = (line: { groupName: string | null; productId: string | null }): string =>
    line.groupName?.trim() || (line.productId ? catalog.get(line.productId)?.group?.trim() : null) || OTHER_GROUP;
  const total = sum._sum.total ?? 0;
  const previousTotal = previous._sum.total ?? 0;
  return {
    month, previousMonth: before, total, previousTotal, changePercent: changePercent(total, previousTotal), purchaseCount: count,
    groups: groupTotals(lineRows.map((line) => ({ lineTotal: line.lineTotal, groupName: groupOf(line) }))),
    purchases: {
      page, limit, total: count,
      items: purchases.map((purchase) => ({
        id: purchase.id,
        purchasedAt: purchase.purchasedAt.toISOString(),
        buyerUserId: purchase.buyerUserId,
        itemCount: purchase.itemCount,
        total: purchase.total,
        lines: purchase.items.map((line) => ({
          id: line.id, name: line.name, quantity: line.quantity, unit: line.unit,
          unitLabel: line.unitLabel ?? (line.productId ? catalog.get(line.productId)?.unitLabel ?? null : null),
          unitPrice: line.paidUnitPrice,
          // The price before the discount, only when a discount applied (shown struck through).
          originalUnitPrice: line.discountPercent && line.unitPrice !== null && line.paidUnitPrice !== null && line.unitPrice > line.paidUnitPrice ? line.unitPrice : null,
          discountPercent: line.discountPercent && line.discountPercent > 0 ? line.discountPercent : null,
          lineTotal: line.lineTotal,
          group: groupOf(line),
        })),
      })),
    },
  };
}
