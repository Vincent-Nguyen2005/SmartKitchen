/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { bannerSession, bestPromotionFor, orderBannerText, orderPromotions, promoTagLabel, promoTags, promotionDetailOf, shortAmount, type ShopPromotion } from "./marketPromotions";
import { sameCardProps } from "./marketCard";

const promo = (overrides: Partial<ShopPromotion> = {}): ShopPromotion => ({
  id: "p1", name: "Rau củ giảm 10%", scope: "GROUP", groups: ["Rau củ"], productIds: [], type: "PERCENT", value: 10, maxDiscount: null,
  minSubtotal: null, startDate: "2026-11-20", endDate: "2026-12-04", ...overrides,
});
const carrot = { id: "carrot", group: "rau củ", price: 30_000, discountPercent: null };
const beef = { id: "beef", group: "Thịt", price: 300_000, discountPercent: 10 };
const salt = { id: "salt", group: "Gia vị", price: null, discountPercent: null };

test("tag labels: percent, and amounts with k (tr for millions)", () => {
  assert.equal(promoTagLabel({ type: "PERCENT", value: 10 }), "KM −10%");
  assert.equal(promoTagLabel({ type: "AMOUNT", value: 20_000 }), "KM −20k");
  assert.equal(shortAmount(1_500), "1,5k");
  assert.equal(shortAmount(500), "500đ");
  assert.equal(shortAmount(1_200_000), "1,2tr");
});

test("eligibility: GROUP by group name (case-insensitive), PRODUCTS by id; ORDER never tags a card", () => {
  const tags = promoTags([carrot, beef, salt], [promo(), promo({ id: "p2", scope: "PRODUCTS", groups: [], productIds: ["salt"], type: "AMOUNT", value: 5_000 }), promo({ id: "p3", scope: "ORDER", groups: [] })]);
  assert.deepEqual(Object.fromEntries(tags), { carrot: "KM −10%", salt: "KM −5k" });
  assert.equal(promoTags([carrot], [promo({ scope: "ORDER" })]).size, 0);
  assert.equal(promoTags([carrot], []).size, 0);
});

test("best pick per product: the largest discount on one unit at its shown price (cap applied), ties → ends soonest", () => {
  // Beef shows 270 000đ: 10% = 27 000 vs 20 000 → the percent; with a 15 000 cap → the amount.
  const percent = promo({ id: "pct", scope: "PRODUCTS", productIds: ["beef"], value: 10 });
  const amount = promo({ id: "amt", scope: "GROUP", groups: ["Thịt"], type: "AMOUNT", value: 20_000 });
  assert.equal(bestPromotionFor(beef, [amount, percent])?.id, "pct");
  assert.equal(bestPromotionFor(beef, [amount, { ...percent, maxDiscount: 15_000 }])?.id, "amt");
  // An amount above the price counts only up to the price (carrot 30 000đ): 50 000 → 30 000 > 10% (3 000).
  assert.equal(bestPromotionFor(carrot, [promo(), promo({ id: "big", type: "AMOUNT", value: 50_000 })])?.id, "big");
  const later = promo({ id: "later", endDate: "2026-12-31" });
  const sooner = promo({ id: "sooner", endDate: "2026-12-01" });
  assert.equal(bestPromotionFor(carrot, [later, sooner])?.id, "sooner");
  assert.equal(bestPromotionFor(beef, [promo()]), null);
});

test("banner text: percent with cap and minimum, amount for every order; ORDER promotions ending soonest first", () => {
  assert.equal(orderBannerText(promo({ scope: "ORDER", maxDiscount: 50_000, minSubtotal: 200_000 })), "Giảm 10% (tối đa 50.000đ) cho đơn từ 200.000đ · đến 04/12");
  assert.equal(orderBannerText(promo({ scope: "ORDER", type: "AMOUNT", value: 20_000, endDate: "2026-12-31" })), "Giảm 20.000đ cho mọi đơn · đến 31/12");
  const list = orderPromotions([promo({ id: "g" }), promo({ id: "o2", scope: "ORDER", endDate: "2026-12-31" }), promo({ id: "o1", scope: "ORDER", endDate: "2026-12-02" })]);
  assert.deepEqual(list.map((entry) => entry.id), ["o1", "o2"]);
});

test("banner detail opens PromotionDetail without 'Mua'; ✕ hides it for the session", () => {
  const detail = promotionDetailOf(promo({ scope: "ORDER", minSubtotal: 200_000 }));
  assert.equal(detail.externalId, "checkout-promotion:p1");
  assert.equal(detail.endsAt, "2026-12-04T23:59:59.999+07:00");
  assert.match(detail.description, /Tự động áp dụng khi đặt hàng/);
  bannerSession.reset();
  assert.equal(bannerSession.dismissed(), false);
  bannerSession.dismiss();
  assert.equal(bannerSession.dismissed(), true);
  bannerSession.reset();
});

test("card memo: tags are stable strings, so a selection toggle still re-renders only the toggled card", () => {
  const products = [carrot, beef, salt];
  const tags = promoTags(products, [promo()]);
  const onPress = () => undefined;
  const onLongPress = () => undefined;
  const props = (selectedId: string | null) => products.map((product) => ({ product, width: 100, selected: selectedId === null ? undefined : product.id === selectedId, onPress, onLongPress, promoTag: tags.get(product.id) ?? null }));
  const before = props("carrot");
  // Rebuilt tags (e.g. a refresh with the same promotions) give equal strings: nothing re-renders.
  const rebuilt = promoTags(products, [promo()]);
  const same = products.map((product, index) => ({ ...before[index], promoTag: rebuilt.get(product.id) ?? null }));
  assert.equal(before.filter((entry, index) => !sameCardProps(entry, same[index])).length, 0);
  // Toggle beef: only beef changes.
  const after = before.map((entry) => (entry.product.id === "beef" ? { ...entry, selected: true } : entry));
  assert.deepEqual(before.filter((entry, index) => !sameCardProps(entry, after[index])).map((entry) => entry.product.id), ["beef"]);
  // A new tag on one product re-renders just that card.
  const tagged = before.map((entry) => (entry.product.id === "salt" ? { ...entry, promoTag: "KM −5k" } : entry));
  assert.deepEqual(before.filter((entry, index) => !sameCardProps(entry, tagged[index])).map((entry) => entry.product.id), ["salt"]);
});

test("no active promotions (checkout promotions off): no KM tags and no banner", () => {
  assert.equal(promoTags([carrot, beef, salt], []).size, 0);
  assert.deepEqual(orderPromotions([]), []);
});
