/**
 * Giỏ hàng / Đi chợ quantity rules (the server checks the same, shopping-list-service lib/quantity-rule):
 * - kg: steps of 0.1 kg, from 0.1 to 20 kg (1,5 kg thịt).
 * - every other unit: whole numbers from 1 to 999.
 */
export type QuantityRule = { step: number; min: number; max: number; decimals: boolean };

const KG_RULE: QuantityRule = { step: 0.1, min: 0.1, max: 20, decimals: true };
const WHOLE_RULE: QuantityRule = { step: 1, min: 1, max: 999, decimals: false };

export const quantityRuleFor = (unit: string): QuantityRule => (unit === "KILOGRAM" ? KG_RULE : WHOLE_RULE);

const tenths = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, rule: QuantityRule): number => Math.min(rule.max, Math.max(rule.min, value));

/**
 * One stepper press. Lands on the rule's grid: an older 0.25 kg line goes to 0.3 (up) or 0.2 (down).
 * Other units keep the old behaviour (± 1) so lines with a recipe amount (250 g) still change by 1.
 */
export const stepQuantity = (value: number, direction: 1 | -1, rule: QuantityRule): number => {
  if (!rule.decimals) return Math.round((value + direction * rule.step) * 1000) / 1000;
  const grid = direction > 0 ? Math.floor(value * 10 + 1e-9) / 10 + rule.step : Math.ceil(value * 10 - 1e-9) / 10 - rule.step;
  return clamp(tenths(grid), rule);
};

/** Typed quantity ("1,5" or "1.5" for kg; digits only otherwise), snapped and kept within the rule; null when empty. */
export const parseQuantity = (text: string, rule: QuantityRule): number | null => {
  const cleaned = rule.decimals ? text.replace(",", ".").replace(/[^0-9.]/g, "") : text.replace(/[^0-9]/g, "");
  const value = Number(cleaned);
  if (!cleaned || !Number.isFinite(value) || value <= 0) return null;
  return clamp(rule.decimals ? tenths(value) : Math.round(value), rule);
};

/** Quantity as people read it in Vietnamese: decimal comma ("1,5"). */
export const formatQuantity = (value: number): string => String(Math.round(value * 1000) / 1000).replace(".", ",");
