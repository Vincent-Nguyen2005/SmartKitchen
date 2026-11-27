/**
 * Automatic checkout promotions while shopping in Đi chợ (pure; covered by marketPromotions.test.ts).
 * - GROUP / PRODUCTS promotions: a small "KM −10%" / "KM −20k" tag on eligible product cards (applied at checkout; the
 *   red per-product discount pill is the one that changes the price). Several matches → the best one for that
 *   product: the largest discount on one sale unit at its current price, ties → ends soonest.
 * - ORDER promotions: the banner under the search bar ("Giảm 10% (tối đa 50.000đ) cho đơn từ 200.000đ · đến 04/12").
 * The server decides the real discount at checkout (shopping-list-service checkout-promotion.ts).
 */
import { formatVnd } from "../../services/format";

/** GET /api/shopping-list/promotions/active item. */
export type ShopPromotion = {
  id: string;
  name: string;
  scope: "ORDER" | "GROUP" | "PRODUCTS";
  groups: string[];
  productIds: string[];
  type: "PERCENT" | "AMOUNT";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startDate: string;
  endDate: string;
};
type ProductLike = { id: string; group?: string | null; price: number | null; discountPercent: number | null };

const key = (value: string): string => value.normalize("NFC").trim().toLocaleLowerCase("vi");

/** "20k", "1,5k", "500đ", "1,2tr" (short amounts for small tags). */
export function shortAmount(amount: number): string {
  const trim = (value: number) => String(Math.round(value * 10) / 10).replace(".", ",");
  if (amount >= 1_000_000) return `${trim(amount / 1_000_000)}tr`;
  if (amount >= 1_000) return `${trim(amount / 1_000)}k`;
  return `${Math.round(amount)}đ`;
}

/** "KM −10%" / "KM −20k". */
export const promoTagLabel = (promotion: Pick<ShopPromotion, "type" | "value">): string =>
  `KM −${promotion.type === "PERCENT" ? `${promotion.value}%` : shortAmount(promotion.value)}`;

/** Does this GROUP / PRODUCTS promotion cover the product? (ORDER promotions are the banner, never a tag.) */
export const coversProduct = (promotion: ShopPromotion, product: ProductLike): boolean =>
  promotion.scope === "PRODUCTS" ? promotion.productIds.includes(product.id)
    : promotion.scope === "GROUP" ? !!product.group && promotion.groups.some((group) => key(group) === key(product.group as string))
      : false;

/** Discount on one sale unit at the price shown (after the per-product discount); used only to rank matches. */
const unitDiscount = (promotion: ShopPromotion, product: ProductLike): number => {
  const price = product.price === null ? null : Math.round((product.price * (100 - (product.discountPercent ?? 0))) / 100);
  if (price === null) return promotion.type === "PERCENT" ? promotion.value : 0; // no price: rank percents by value
  const raw = promotion.type === "PERCENT" ? Math.round((price * promotion.value) / 100) : promotion.value;
  const capped = promotion.type === "PERCENT" && promotion.maxDiscount !== null ? Math.min(raw, promotion.maxDiscount) : raw;
  return Math.min(capped, price);
};

/** The best tag promotion for a product, or null. */
export function bestPromotionFor(product: ProductLike, promotions: ShopPromotion[]): ShopPromotion | null {
  let best: { promotion: ShopPromotion; amount: number } | null = null;
  for (const promotion of promotions) {
    if (!coversProduct(promotion, product)) continue;
    const amount = unitDiscount(promotion, product);
    if (!best || amount > best.amount || (amount === best.amount && promotion.endDate < best.promotion.endDate)) best = { promotion, amount };
  }
  return best?.promotion ?? null;
}

/**
 * Tag label per product id (only products with a tag). Built once per catalog / promotions change, so a card's
 * `promoTag` string stays the same between renders and the memoized cards are untouched by selection toggles.
 */
export function promoTags(products: ProductLike[], promotions: ShopPromotion[]): Map<string, string> {
  const tags = new Map<string, string>();
  const tagPromotions = promotions.filter((promotion) => promotion.scope !== "ORDER");
  if (tagPromotions.length === 0) return tags;
  for (const product of products) {
    const best = bestPromotionFor(product, tagPromotions);
    if (best) tags.set(product.id, promoTagLabel(best));
  }
  return tags;
}

/** Banner promotions: ORDER scope, ending soonest first. */
export const orderPromotions = (promotions: ShopPromotion[]): ShopPromotion[] =>
  promotions.filter((promotion) => promotion.scope === "ORDER").sort((first, second) => first.endDate.localeCompare(second.endDate) || first.id.localeCompare(second.id));

const dayMonth = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** "Giảm 10% (tối đa 50.000đ) cho đơn từ 200.000đ · đến 04/12" / "Giảm 20.000đ cho mọi đơn · đến 31/12". */
export function orderBannerText(promotion: Pick<ShopPromotion, "type" | "value" | "maxDiscount" | "minSubtotal" | "endDate">): string {
  const amount = promotion.type === "PERCENT"
    ? `Giảm ${promotion.value}%${promotion.maxDiscount ? ` (tối đa ${formatVnd(promotion.maxDiscount)})` : ""}`
    : `Giảm ${formatVnd(promotion.value)}`;
  const condition = promotion.minSubtotal ? `cho đơn từ ${formatVnd(promotion.minSubtotal)}` : "cho mọi đơn";
  return `${amount} ${condition} · đến ${dayMonth(promotion.endDate)}`;
}

/** The promotion as PromotionDetail shows it (no "Mua": externalId marks it as a checkout promotion). */
export const promotionDetailOf = (promotion: ShopPromotion) => ({
  id: promotion.id,
  title: promotion.name,
  description: `${orderBannerText(promotion)}. Tự động áp dụng khi đặt hàng, không cần mã.`,
  discountInfo: null,
  productKeywords: [promotion.name],
  imageUrl: null,
  startsAt: `${promotion.startDate}T00:00:00.000+07:00`,
  endsAt: `${promotion.endDate}T23:59:59.999+07:00`,
  externalId: `checkout-promotion:${promotion.id}`,
});

/** Banner dismissed with ✕ for this app session (module state: back after the app restarts). */
let bannerDismissed = false;
export const bannerSession = {
  dismissed: (): boolean => bannerDismissed,
  dismiss: (): void => { bannerDismissed = true; },
  /** Tests only. */
  reset: (): void => { bannerDismissed = false; },
};
