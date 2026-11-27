import { createCachedList, type CachedList } from "../../services/localSearch";
import { shoppingApi } from "./shoppingApi";
import type { ShopPromotion } from "./marketPromotions";

/** Running promotions change rarely: a copy this young is reused (Đi chợ refresh ticks, remounts). */
export const PROMOTIONS_MAX_AGE_MS = 3 * 60_000;

let store: { token: string; list: CachedList<ShopPromotion> } | null = null;

/**
 * Running checkout promotions (GET /api/shopping-list/promotions/active), cached for the session next to the market
 * catalog: loaded with it, again on pull-to-refresh (force) and on Đi chợ's auto refresh when older than
 * PROMOTIONS_MAX_AGE_MS. Searching never asks for them.
 */
export function activePromotions(accessToken: string): CachedList<ShopPromotion> {
  if (!store) {
    store = {
      token: accessToken,
      list: createCachedList(async () => (await shoppingApi.activePromotions(store?.token ?? accessToken)).items, PROMOTIONS_MAX_AGE_MS),
    };
  }
  store.token = accessToken;
  return store.list;
}
