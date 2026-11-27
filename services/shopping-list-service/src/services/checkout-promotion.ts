/**
 * Automatic checkout promotions (pure; covered by checkout-promotion.test.ts). No codes: the order gets the single
 * eligible promotion with the largest discount.
 *
 * - Subtotal = sum of the rounded line totals after per-product discounts (spending.service.ts rounding).
 * - Eligible: active, today (Vietnam calendar) within startDate..endDate, subtotal ≥ minSubtotal, the buyer under the
 *   per-user limit, and something to discount: ORDER → the whole subtotal; GROUP → lines of those catalog groups
 *   (case-insensitive); PRODUCTS → lines of those catalog products.
 * - Discount: PERCENT → round(eligible × value / 100), at most maxDiscount; AMOUNT → value. Whole VND, never more than
 *   the eligible amount.
 * - Best: the largest discount; ties → the one that ends soonest, then the oldest. No stacking.
 * - The discount is split over the eligible lines in proportion to their totals (largest remainder, whole VND), so
 *   the parts add up exactly to the discount ("Chi tiêu" groups still sum to the month total).
 */
export type PromotionRule = {
  id: string;
  name: string;
  scope: "ORDER" | "GROUP" | "PRODUCTS";
  groups: string[];
  productIds: string[];
  type: "PERCENT" | "AMOUNT";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  /** Vietnam calendar days, YYYY-MM-DD. */
  startDay: string;
  endDay: string;
  usageLimitPerUser: number | null;
  isActive: boolean;
  createdAt?: Date;
};
export type PricedLine = { id: string; lineTotal: number | null; productId: string | null; group: string | null };
export type AppliedPromotion = { id: string; name: string; discount: number; eligibleAmount: number };
export type PromotionHint = { id: string; name: string; missing: number; text: string };
export type PromotionResult = {
  subtotal: number;
  promotion: AppliedPromotion | null;
  total: number;
  /** "Mua thêm 30.000 đ để được <tên>": a better promotion within 30 % of its minimum. */
  hint: PromotionHint | null;
  /** Discount part per line id (only lines with a part > 0). */
  shares: Map<string, number>;
};

const VN_OFFSET_MS = 7 * 3_600_000;
/** A promotion counts as close when the subtotal already reaches 70 % of its minimum. */
export const HINT_RATIO = 0.7;

export const vnDay = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export type PromotionStatus = "UPCOMING" | "RUNNING" | "ENDED" | "OFF";
/** Admin list label: Tắt / Sắp diễn ra / Đang chạy / Hết hạn. */
export const promotionStatus = (rule: Pick<PromotionRule, "isActive" | "startDay" | "endDay">, today: string = vnDay()): PromotionStatus =>
  !rule.isActive ? "OFF" : today < rule.startDay ? "UPCOMING" : today > rule.endDay ? "ENDED" : "RUNNING";

const key = (value: string): string => value.normalize("NFC").trim().toLocaleLowerCase("vi");

/** Sum of the line totals this promotion applies to. */
export const eligibleAmount = (rule: PromotionRule, lines: PricedLine[]): number => eligibleLines(rule, lines).reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);

const eligibleLines = (rule: PromotionRule, lines: PricedLine[]): PricedLine[] => {
  const priced = lines.filter((line) => (line.lineTotal ?? 0) > 0);
  if (rule.scope === "ORDER") return priced;
  if (rule.scope === "GROUP") {
    const groups = new Set(rule.groups.map(key));
    return priced.filter((line) => line.group !== null && groups.has(key(line.group)));
  }
  const products = new Set(rule.productIds);
  return priced.filter((line) => line.productId !== null && products.has(line.productId));
};

/** The discount on `eligible` VND (whole VND, capped, never more than eligible). */
export const discountFor = (rule: Pick<PromotionRule, "type" | "value" | "maxDiscount">, eligible: number): number => {
  if (eligible <= 0) return 0;
  let discount = rule.type === "PERCENT" ? Math.round((eligible * rule.value) / 100) : Math.round(rule.value);
  if (rule.type === "PERCENT" && rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return Math.max(0, Math.min(discount, eligible));
};

/** Whole-VND parts of `amount` over the lines in proportion to their totals (largest remainder; ties → line order). */
export const splitDiscount = (amount: number, lines: PricedLine[]): Map<string, number> => {
  const shares = new Map<string, number>();
  const base = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  if (amount <= 0 || base <= 0) return shares;
  const exact = lines.map((line, index) => ({ id: line.id, index, value: (amount * (line.lineTotal ?? 0)) / base }));
  let left = amount;
  for (const part of exact) { const whole = Math.floor(part.value); shares.set(part.id, whole); left -= whole; }
  const byRemainder = [...exact].sort((first, second) => (second.value - Math.floor(second.value)) - (first.value - Math.floor(first.value)) || first.index - second.index);
  for (let index = 0; left > 0 && index < byRemainder.length; index += 1, left -= 1) shares.set(byRemainder[index].id, (shares.get(byRemainder[index].id) ?? 0) + 1);
  for (const [id, share] of shares) if (share === 0) shares.delete(id);
  return shares;
};

/** "30.000đ", like the app (services/format.ts). */
const fmt = (amount: number): string => `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;

/**
 * The checkout result for these lines. `usage`: how many times the buyer already used each promotion (delivered
 * orders plus orders still on the way).
 */
export function applyPromotions(lines: PricedLine[], rules: PromotionRule[], usage: Map<string, number>, today: string = vnDay()): PromotionResult {
  const subtotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const running = rules.filter((rule) => promotionStatus(rule, today) === "RUNNING" && (rule.usageLimitPerUser === null || (usage.get(rule.id) ?? 0) < rule.usageLimitPerUser));
  const candidates = running.map((rule) => {
    const eligible = eligibleAmount(rule, lines);
    return { rule, eligible, discount: discountFor(rule, eligible) };
  }).filter((entry) => entry.discount > 0);
  const order = (first: (typeof candidates)[number], second: (typeof candidates)[number]) =>
    second.discount - first.discount
    || first.rule.endDay.localeCompare(second.rule.endDay)
    || (first.rule.createdAt?.getTime() ?? 0) - (second.rule.createdAt?.getTime() ?? 0)
    || first.rule.id.localeCompare(second.rule.id);
  const best = candidates.filter((entry) => subtotal >= (entry.rule.minSubtotal ?? 0)).sort(order)[0] ?? null;
  const promotion = best ? { id: best.rule.id, name: best.rule.name, discount: best.discount, eligibleAmount: best.eligible } : null;
  // Hint: a promotion whose minimum is not met yet but close, that would give more than the current one.
  const close = candidates
    .filter((entry) => entry.rule.minSubtotal !== null && subtotal < entry.rule.minSubtotal && subtotal >= entry.rule.minSubtotal * HINT_RATIO && entry.discount > (promotion?.discount ?? 0))
    .map((entry) => ({ entry, missing: (entry.rule.minSubtotal as number) - subtotal }))
    .sort((first, second) => first.missing - second.missing || order(first.entry, second.entry))[0];
  const hint = close ? { id: close.entry.rule.id, name: close.entry.rule.name, missing: close.missing, text: `Mua thêm ${fmt(close.missing)} để được ${close.entry.rule.name}` } : null;
  const shares = best ? splitDiscount(best.discount, eligibleLines(best.rule, lines)) : new Map<string, number>();
  return { subtotal, promotion, total: subtotal - (promotion?.discount ?? 0), hint, shares };
}
