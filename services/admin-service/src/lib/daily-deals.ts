/**
 * Automatic daily discounts (pure; covered by daily-deals.test.ts). Every Vietnam day N catalog products get a
 * per-item discount that the app shows exactly like an admin discount (catalog discountPercent: red pill, struck
 * price, cart snapshot, checkout rounding). No label, no countdown, no Thông báo row.
 *
 * - Eligible: active, with a price > 0, not excluded in the settings, no admin discount running that day, and not a
 *   daily deal in the previous 3 days.
 * - Pick: about half (ceil(N/2)) from the products most used in this week's family menus (anonymous household counts
 *   from menu-service; ties broken by the seeded order), the rest at random among the other eligible products.
 * - Randomness is seeded by the day (and the reroll number), so the same day always gives the same list.
 * - Percent: a whole number in [minPercent, maxPercent]; when the range contains multiples of 5, one of those
 *   (5, 10, 15, 20 for the default 5-20), which read like shop prices; otherwise any whole number in the range.
 */
import { promotionStatus } from "./promotion-sync";

export type DealSettings = { enabled: boolean; dealsPerDay: number; minPercent: number; maxPercent: number; excludedProductIds: string[] };
export const DEFAULT_SETTINGS: DealSettings = { enabled: true, dealsPerDay: 10, minPercent: 5, maxPercent: 20, excludedProductIds: [] };
export const NO_REPEAT_DAYS = 3;

export type DealProduct = {
  id: string;
  name: string;
  isActive: boolean;
  price: number | null;
  discountPercent: number | null;
  /** YYYY-MM-DD (Vietnam days) of an admin discount window; null = open. */
  promoStartDay: string | null;
  promoEndDay: string | null;
};
export type PickedDeal = { productId: string; percent: number; source: "MENU" | "RANDOM" | "SWAP" };

/** FNV-1a 32-bit hash of a string (seed). */
export const hashSeed = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** mulberry32: small, fast, deterministic PRNG in [0, 1). */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

/** An admin (manual) discount is running on that Vietnam day. */
export const hasManualDiscount = (product: DealProduct, day: string): boolean =>
  product.discountPercent !== null && promotionStatus(product.promoStartDay, product.promoEndDay, day) === "running";

/** Products that may get a daily deal on `day`. */
export function eligibleProducts(products: DealProduct[], settings: DealSettings, day: string, recentProductIds: ReadonlySet<string>): DealProduct[] {
  const excluded = new Set(settings.excludedProductIds);
  return products.filter((product) => product.isActive && product.price !== null && product.price > 0 && !excluded.has(product.id)
    && !hasManualDiscount(product, day) && !recentProductIds.has(product.id));
}

/** A whole percent in [min, max]; a multiple of 5 when the range has one. */
export function pickPercent(min: number, max: number, random: () => number): number {
  const fives: number[] = [];
  for (let value = Math.ceil(min / 5) * 5; value <= max; value += 5) fives.push(value);
  if (fives.length > 0) return fives[Math.floor(random() * fives.length)];
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * The day's deals. `usage`: households per product id this week (menu-service); `reroll` changes the seed for
 * "Chọn lại hôm nay". Same inputs → same output.
 */
export function selectDeals(input: { day: string; products: DealProduct[]; settings: DealSettings; recentProductIds: ReadonlySet<string>; usage: ReadonlyMap<string, number>; reroll?: number }): PickedDeal[] {
  const { day, settings } = input;
  if (!settings.enabled || settings.dealsPerDay <= 0) return [];
  const random = seededRandom(hashSeed(`daily-deals:${day}:${input.reroll ?? 0}`));
  // A seeded order of every eligible product (ties in popularity follow it; the random half takes from it).
  const pool = shuffle(eligibleProducts(input.products, settings, day, input.recentProductIds).sort((first, second) => first.id.localeCompare(second.id)), random);
  const target = Math.min(settings.dealsPerDay, pool.length);
  const popularCount = Math.ceil(target / 2);
  const rank = new Map(pool.map((product, index) => [product.id, index]));
  const popular = pool.filter((product) => (input.usage.get(product.id) ?? 0) > 0)
    .sort((first, second) => (input.usage.get(second.id) ?? 0) - (input.usage.get(first.id) ?? 0) || (rank.get(first.id) ?? 0) - (rank.get(second.id) ?? 0))
    .slice(0, popularCount);
  const chosen = new Set(popular.map((product) => product.id));
  const rest = pool.filter((product) => !chosen.has(product.id)).slice(0, target - popular.length);
  return [
    ...popular.map((product) => ({ productId: product.id, percent: pickPercent(settings.minPercent, settings.maxPercent, random), source: "MENU" as const })),
    ...rest.map((product) => ({ productId: product.id, percent: pickPercent(settings.minPercent, settings.maxPercent, random), source: "RANDOM" as const })),
  ];
}

/** "Đổi món": another eligible product (not in today's list), seeded by the day and the replaced product. */
export function pickReplacement(input: { day: string; replacedId: string; todayIds: ReadonlySet<string>; products: DealProduct[]; settings: DealSettings; recentProductIds: ReadonlySet<string>; attempt?: number }): PickedDeal | null {
  const random = seededRandom(hashSeed(`daily-deals:${input.day}:swap:${input.replacedId}:${input.attempt ?? 0}`));
  const candidates = eligibleProducts(input.products, input.settings, input.day, input.recentProductIds)
    .filter((product) => !input.todayIds.has(product.id) && product.id !== input.replacedId)
    .sort((first, second) => first.id.localeCompare(second.id));
  if (candidates.length === 0) return null;
  const product = candidates[Math.floor(random() * candidates.length)];
  return { productId: product.id, percent: pickPercent(input.settings.minPercent, input.settings.maxPercent, random), source: "SWAP" };
}

/** Settings validation (admin form and server): messages per field. */
export function settingsProblems(input: { dealsPerDay: number; minPercent: number; maxPercent: number }): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!Number.isInteger(input.dealsPerDay) || input.dealsPerDay < 1 || input.dealsPerDay > 30) problems.dealsPerDay = "Từ 1 đến 30 sản phẩm mỗi ngày";
  if (!Number.isInteger(input.minPercent) || input.minPercent < 1 || input.minPercent > 50) problems.minPercent = "Phần trăm nguyên từ 1 đến 50";
  if (!Number.isInteger(input.maxPercent) || input.maxPercent < 1 || input.maxPercent > 50) problems.maxPercent = "Phần trăm nguyên từ 1 đến 50";
  if (!problems.minPercent && !problems.maxPercent && input.minPercent > input.maxPercent) problems.maxPercent = "Mức cao nhất phải từ mức thấp nhất trở lên";
  return problems;
}

/** Normalized name key, the same as MasterIngredient.nameNormalized (no diacritics, lower case). */
export const nameKey = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().trim().replace(/\s+/g, " ");
