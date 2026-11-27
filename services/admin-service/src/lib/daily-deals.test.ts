import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, eligibleProducts, hashSeed, nameKey, pickPercent, pickReplacement, seededRandom, selectDeals, settingsProblems, type DealProduct } from "./daily-deals";

const product = (id: string, overrides: Partial<DealProduct> = {}): DealProduct => ({
  id, name: `Sản phẩm ${id}`, isActive: true, price: 20_000, discountPercent: null, promoStartDay: null, promoEndDay: null, ...overrides,
});
const catalog = Array.from({ length: 40 }, (_, index) => product(`p${String(index).padStart(2, "0")}`));
const none = new Set<string>();
const noUsage = new Map<string, number>();
const DAY = "2026-12-10";

describe("eligibility", () => {
  it("leaves out inactive, unpriced, excluded, admin-discounted (that day) and recently picked products", () => {
    const products = [
      product("ok"),
      product("inactive", { isActive: false }),
      product("no-price", { price: null }),
      product("free", { price: 0 }),
      product("excluded"),
      product("manual", { discountPercent: 20, promoStartDay: "2026-12-01", promoEndDay: "2026-12-31" }),
      product("manual-ended", { discountPercent: 20, promoStartDay: "2026-11-01", promoEndDay: "2026-12-09" }),
      product("manual-later", { discountPercent: 20, promoStartDay: "2026-12-11", promoEndDay: "2026-12-31" }),
      product("recent"),
    ];
    const ids = eligibleProducts(products, { ...DEFAULT_SETTINGS, excludedProductIds: ["excluded"] }, DAY, new Set(["recent"])).map((entry) => entry.id);
    expect(ids).toEqual(["ok", "manual-ended", "manual-later"]);
  });

  it("3-day no-repeat: yesterday's deals are not picked again", () => {
    const yesterday = selectDeals({ day: "2026-12-09", products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage });
    const today = selectDeals({ day: DAY, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: new Set(yesterday.map((deal) => deal.productId)), usage: noUsage });
    expect(today).toHaveLength(10);
    expect(today.some((deal) => yesterday.some((old) => old.productId === deal.productId))).toBe(false);
  });
});

describe("selection", () => {
  it("is deterministic per date (same day → same list), and differs between days", () => {
    const first = selectDeals({ day: DAY, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage });
    const again = selectDeals({ day: DAY, products: [...catalog].reverse(), settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage });
    const other = selectDeals({ day: "2026-12-11", products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage });
    expect(again).toEqual(first);
    expect(other.map((deal) => deal.productId)).not.toEqual(first.map((deal) => deal.productId));
    expect(new Set(first.map((deal) => deal.productId)).size).toBe(10);
    // "Chọn lại hôm nay" (reroll 1) gives another list.
    expect(selectDeals({ day: DAY, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage, reroll: 1 }).map((deal) => deal.productId)).not.toEqual(first.map((deal) => deal.productId));
  });

  it("about half from the products most used in this week's menus, the rest random", () => {
    const usage = new Map([["p05", 9], ["p06", 7], ["p07", 7], ["p08", 3], ["p09", 2], ["p10", 1], ["p11", 1]]);
    const deals = selectDeals({ day: DAY, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage });
    const menu = deals.filter((deal) => deal.source === "MENU").map((deal) => deal.productId);
    expect(menu).toHaveLength(5);
    expect(menu.slice(0, 1)).toEqual(["p05"]);
    expect(new Set(menu)).toEqual(new Set(["p05", "p06", "p07", "p08", "p09"]));
    expect(deals.filter((deal) => deal.source === "RANDOM")).toHaveLength(5);
  });

  it("fewer eligible products than N: picks what is available; off or N = 0: nothing", () => {
    expect(selectDeals({ day: DAY, products: catalog.slice(0, 3), settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage })).toHaveLength(3);
    expect(selectDeals({ day: DAY, products: catalog, settings: { ...DEFAULT_SETTINGS, enabled: false }, recentProductIds: none, usage: noUsage })).toEqual([]);
  });

  it("percent: whole numbers in range, multiples of 5 when the range has them", () => {
    const random = seededRandom(hashSeed("percent"));
    const values = Array.from({ length: 200 }, () => pickPercent(5, 20, random));
    expect(new Set(values)).toEqual(new Set([5, 10, 15, 20]));
    const narrow = Array.from({ length: 200 }, () => pickPercent(11, 14, random));
    expect(narrow.every((value) => Number.isInteger(value) && value >= 11 && value <= 14)).toBe(true);
    expect(Array.from({ length: 50 }, () => pickPercent(12, 18, random)).every((value) => value === 15)).toBe(true);
    const deals = selectDeals({ day: DAY, products: catalog, settings: { ...DEFAULT_SETTINGS, minPercent: 10, maxPercent: 30 }, recentProductIds: none, usage: noUsage });
    expect(deals.every((deal) => deal.percent >= 10 && deal.percent <= 30 && deal.percent % 5 === 0)).toBe(true);
  });

  it("Đổi nguyên liệu: another eligible product not already in today's list", () => {
    const today = selectDeals({ day: DAY, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none, usage: noUsage });
    const todayIds = new Set(today.map((deal) => deal.productId));
    const replacement = pickReplacement({ day: DAY, replacedId: today[0].productId, todayIds, products: catalog, settings: DEFAULT_SETTINGS, recentProductIds: none });
    expect(replacement?.source).toBe("SWAP");
    expect(todayIds.has(replacement?.productId ?? "")).toBe(false);
    expect(pickReplacement({ day: DAY, replacedId: "p00", todayIds: new Set(["p00"]), products: [product("p00")], settings: DEFAULT_SETTINGS, recentProductIds: none })).toBeNull();
  });
});

describe("settings validation and name matching", () => {
  it("dealsPerDay 1-30, percents 1-50 whole numbers, min ≤ max", () => {
    expect(settingsProblems({ dealsPerDay: 10, minPercent: 5, maxPercent: 20 })).toEqual({});
    expect(settingsProblems({ dealsPerDay: 0, minPercent: 5, maxPercent: 20 })).toHaveProperty("dealsPerDay");
    expect(settingsProblems({ dealsPerDay: 31, minPercent: 5, maxPercent: 20 })).toHaveProperty("dealsPerDay");
    expect(settingsProblems({ dealsPerDay: 10, minPercent: 5.5, maxPercent: 20 })).toHaveProperty("minPercent");
    expect(settingsProblems({ dealsPerDay: 10, minPercent: 5, maxPercent: 51 })).toHaveProperty("maxPercent");
    expect(settingsProblems({ dealsPerDay: 10, minPercent: 25, maxPercent: 20 })).toEqual({ maxPercent: "Mức cao nhất phải từ mức thấp nhất trở lên" });
  });

  it("menu names match catalog names without diacritics", () => {
    expect(nameKey("Thịt  Heo")).toBe(nameKey("thit heo"));
    expect(nameKey("Đậu phụ")).toBe("dau phu");
  });
});
