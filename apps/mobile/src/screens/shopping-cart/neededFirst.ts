/**
 * Đi chợ "needed first": products this week's menus still need (menu-service GET /api/menus/week-missing) come
 * first, in the weekly list's order; then every other product in the usual order, once. The amounts themselves are
 * shown in Thông báo › "Cần mua tuần này", not on the product cards.
 * Pure functions (no React Native), covered by neededFirst.test.ts.
 */

/** The field of a week-missing item used here (WeekShoppingScreen's WeekMissingItem has it too). */
export type NeededItem = { productId: string | null };

/** Catalog product ids in the weekly list's order, each once (items not sold in Đi chợ have none). */
export function neededProductIds(items: NeededItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) if (item.productId && !ids.includes(item.productId)) ids.push(item.productId);
  return ids;
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
