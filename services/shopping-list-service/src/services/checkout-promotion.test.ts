import { describe, expect, it } from "vitest";
import { applyPromotions, discountFor, promotionStatus, splitDiscount, type PricedLine, type PromotionRule } from "./checkout-promotion";

const TODAY = "2026-12-10";
const rule = (overrides: Partial<PromotionRule> = {}): PromotionRule => ({
  id: "p-order", name: "Giảm 10% đơn hàng", scope: "ORDER", groups: [], productIds: [], type: "PERCENT", value: 10, maxDiscount: null,
  minSubtotal: null, startDay: "2026-12-01", endDay: "2026-12-31", usageLimitPerUser: null, isActive: true, ...overrides,
});
const lines: PricedLine[] = [
  { id: "l1", lineTotal: 120_000, productId: "beef", group: "Thịt" },
  { id: "l2", lineTotal: 45_000, productId: "carrot", group: "Rau củ" },
  { id: "l3", lineTotal: 35_000, productId: "cabbage", group: "rau củ" },
  { id: "l4", lineTotal: null, productId: null, group: null },
];
const none = new Map<string, number>();

describe("eligibility", () => {
  it("dates: only from the first day through the whole last day (Vietnam days); inactive never", () => {
    expect(promotionStatus(rule(), "2026-11-30")).toBe("UPCOMING");
    expect(promotionStatus(rule(), "2026-12-01")).toBe("RUNNING");
    expect(promotionStatus(rule(), "2026-12-31")).toBe("RUNNING");
    expect(promotionStatus(rule(), "2027-01-01")).toBe("ENDED");
    expect(promotionStatus(rule({ isActive: false }), TODAY)).toBe("OFF");
    expect(applyPromotions(lines, [rule({ startDay: "2026-12-11" })], none, TODAY).promotion).toBeNull();
    expect(applyPromotions(lines, [rule({ endDay: "2026-12-09" })], none, TODAY).promotion).toBeNull();
    expect(applyPromotions(lines, [rule({ isActive: false })], none, TODAY).promotion).toBeNull();
  });

  it("scope: ORDER takes the subtotal; GROUP only matching groups (case-insensitive); PRODUCTS only those products", () => {
    expect(applyPromotions(lines, [rule()], none, TODAY).promotion).toMatchObject({ discount: 20_000, eligibleAmount: 200_000 });
    expect(applyPromotions(lines, [rule({ scope: "GROUP", groups: ["RAU CỦ"] })], none, TODAY).promotion).toMatchObject({ discount: 8_000, eligibleAmount: 80_000 });
    expect(applyPromotions(lines, [rule({ scope: "PRODUCTS", productIds: ["beef"] })], none, TODAY).promotion).toMatchObject({ discount: 12_000, eligibleAmount: 120_000 });
    expect(applyPromotions(lines, [rule({ scope: "GROUP", groups: ["Hải sản"] })], none, TODAY).promotion).toBeNull();
  });

  it("minimum subtotal is compared with the whole order's subtotal", () => {
    expect(applyPromotions(lines, [rule({ minSubtotal: 200_000 })], none, TODAY).promotion?.discount).toBe(20_000);
    expect(applyPromotions(lines, [rule({ minSubtotal: 200_001 })], none, TODAY).promotion).toBeNull();
  });

  it("usage limit: a buyer who used it up does not get it", () => {
    const limited = rule({ usageLimitPerUser: 2 });
    expect(applyPromotions(lines, [limited], new Map([["p-order", 1]]), TODAY).promotion).not.toBeNull();
    expect(applyPromotions(lines, [limited], new Map([["p-order", 2]]), TODAY).promotion).toBeNull();
  });
});

describe("best pick and rounding", () => {
  it("picks the single largest discount; no stacking", () => {
    const result = applyPromotions(lines, [rule(), rule({ id: "p-amount", name: "Giảm 25.000 đ", type: "AMOUNT", value: 25_000 }), rule({ id: "p-meat", scope: "GROUP", groups: ["Thịt"], value: 15 })], none, TODAY);
    expect(result.promotion).toMatchObject({ id: "p-amount", discount: 25_000 });
    expect(result.total).toBe(175_000);
  });

  it("ties: the one that ends soonest wins", () => {
    const later = rule({ id: "later", endDay: "2026-12-31", type: "AMOUNT", value: 20_000 });
    const sooner = rule({ id: "sooner", endDay: "2026-12-15", type: "AMOUNT", value: 20_000 });
    expect(applyPromotions(lines, [later, sooner], none, TODAY).promotion?.id).toBe("sooner");
    expect(applyPromotions(lines, [sooner, later], none, TODAY).promotion?.id).toBe("sooner");
  });

  it("rounds to whole VND, applies the cap, never more than the eligible amount", () => {
    expect(discountFor({ type: "PERCENT", value: 15, maxDiscount: null }, 33_333)).toBe(5_000); // 4 999,95 → 5 000
    expect(discountFor({ type: "PERCENT", value: 7, maxDiscount: null }, 10_007)).toBe(700); // 700,49 → 700
    expect(discountFor({ type: "PERCENT", value: 50, maxDiscount: 30_000 }, 200_000)).toBe(30_000);
    expect(discountFor({ type: "AMOUNT", value: 50_000, maxDiscount: null }, 35_000)).toBe(35_000);
    expect(discountFor({ type: "PERCENT", value: 100, maxDiscount: null }, 12_345)).toBe(12_345);
    expect(applyPromotions(lines, [rule({ scope: "PRODUCTS", productIds: ["cabbage"], type: "AMOUNT", value: 100_000 })], none, TODAY).total).toBe(165_000);
  });

  it("splits the discount over the eligible lines so the parts sum exactly", () => {
    const shares = splitDiscount(10_000, [
      { id: "a", lineTotal: 33_333, productId: null, group: null },
      { id: "b", lineTotal: 33_333, productId: null, group: null },
      { id: "c", lineTotal: 33_334, productId: null, group: null },
    ]);
    expect([...shares.values()].reduce((sum, part) => sum + part, 0)).toBe(10_000);
    expect(Object.fromEntries(shares)).toEqual({ a: 3_333, b: 3_333, c: 3_334 });
    const result = applyPromotions(lines, [rule({ scope: "GROUP", groups: ["Rau củ"], type: "AMOUNT", value: 9_999 })], none, TODAY);
    expect(Object.fromEntries(result.shares)).toEqual({ l2: 5_624, l3: 4_375 });
    expect(result.shares.has("l1")).toBe(false);
  });
});

describe("hint", () => {
  it("'Mua thêm …' when a better promotion is within 30% of its minimum; nothing when far away", () => {
    const big = rule({ id: "big", name: "Giảm 50.000 đ đơn từ 250.000 đ", type: "AMOUNT", value: 50_000, minSubtotal: 250_000 });
    const result = applyPromotions(lines, [rule(), big], none, TODAY);
    expect(result.promotion?.id).toBe("p-order");
    expect(result.hint).toMatchObject({ id: "big", missing: 50_000, text: "Mua thêm 50.000đ để được Giảm 50.000 đ đơn từ 250.000 đ" });
    expect(applyPromotions(lines, [rule({ minSubtotal: 300_000 })], none, TODAY).hint).toBeNull(); // 200k < 70% of 300k
  });
});
