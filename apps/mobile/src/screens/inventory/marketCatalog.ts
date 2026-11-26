import { createCachedList, type CachedList } from "../../services/localSearch";
import { inventoryApi, type CatalogIngredient } from "./inventoryApi";

/** The catalog endpoint returns at most 50 products per page (~139 active products = 3 requests). */
const PAGE_LIMIT = 50;
/** A catalog this young is reused as is (auto refresh); pull-to-refresh and admin edits force a reload. */
export const MARKET_CATALOG_MAX_AGE_MS = 2 * 60_000;

let store: { token: string; list: CachedList<CatalogIngredient> } | null = null;

/**
 * The active market catalog (Quản trị › Nguyên liệu, active rows), shared by Đi chợ, the Kho add form and the cart.
 * Loaded once per session and searched on the device. A new access token for the same session keeps the copy.
 */
export function marketCatalog(accessToken: string): CachedList<CatalogIngredient> {
  if (!store) {
    store = {
      token: accessToken,
      list: createCachedList(async () => {
        const token = store?.token ?? accessToken;
        const items: CatalogIngredient[] = [];
        for (let page = 1; page <= 20; page += 1) {
          const result = await inventoryApi.ingredientCatalog(token, { page, limit: PAGE_LIMIT });
          items.push(...result.items);
          if (page >= result.totalPages || result.items.length === 0) break;
        }
        return items;
      }, MARKET_CATALOG_MAX_AGE_MS),
    };
  }
  store.token = accessToken;
  return store.list;
}
