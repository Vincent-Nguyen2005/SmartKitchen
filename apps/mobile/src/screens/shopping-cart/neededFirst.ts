import { amountText } from "./unitDisplay";

/**
 * Đi chợ "needed first": products this week's menus still need (menu-service GET /api/menus/week-missing) come
 * first, in the weekly list's order, each with "Thiếu 0,7 kg"; then every other product in the usual order, once.
 * Pure functions (no React Native), covered by neededFirst.test.ts.
 */

/** The fields of a week-missing item used here (same shape as WeekShoppingScreen's WeekMissingItem). */
export type NeededItem = {
  productId: string | null;
  quantity: number;
  unit: string;
  saleUnit: string | null;
  saleUnitLabel?: string | null;
  cartQuantity: number | null;
  unitMismatch: boolean;
};

/**
 * "Thiếu …" per catalog product id, in the weekly list's order (first row per product). The amount is what
 * "Thêm vào Giỏ hàng" would buy in the sale unit ("0,7 kg", "2 gói", "3 quả"); without one, the missing amount.
 */
export function neededLabels(items: NeededItem[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const item of items) {
    if (!item.productId || labels.has(item.productId)) continue;
    const amount = item.cartQuantity && item.saleUnit && !item.unitMismatch
      ? amountText(item.cartQuantity, item.saleUnit, item.saleUnitLabel)
      : amountText(item.quantity, item.unit);
    labels.set(item.productId, `Thiếu ${amount}`);
  }
  return labels;
}

/** Lowercase without Vietnamese accents (the catalog search compares the same way). */
const plain = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

/** Same rule as the catalog search: the name contains the typed text (accent- and case-insensitive). */
export const matchesSearch = (name: string, term: string): boolean => !term.trim() || plain(name).includes(plain(term));

/**
 * Needed products (only those matching `term`) in the weekly order, then `rest` without them and without
 * repeats (pages loaded twice after a refresh never duplicate a card).
 */
export function orderNeededFirst<T extends { id: string; name: string }>(needed: T[], order: string[], rest: T[], term = ""): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  const first = needed
    .filter((product) => rank.has(product.id) && matchesSearch(product.name, term))
    .sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const product of [...first, ...rest]) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    result.push(product);
  }
  return result;
}
