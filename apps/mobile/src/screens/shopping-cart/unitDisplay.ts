import { formatQuantity } from "./quantityRule";

/**
 * How Đi chợ, Giỏ hàng and "Cần mua tuần này" name units and amounts ("1 kg", "1 gói", "1 quả ≈ 1,2 kg",
 * "0,7 kg", "3 quả"). Pure functions (no React Native), covered by unitDisplay.test.ts.
 */

/** Fixed words an admin can pick for one piece-type unit (same list as admin-service UNIT_WORDS). */
export const UNIT_WORDS = ["cái", "quả", "trái", "chai", "lon", "hộp", "nải", "bìa"] as const;
export type UnitWord = (typeof UNIT_WORDS)[number];

/** Units sold one by one; they can carry a specific word (unitLabel) and a weight per unit (packGrams). */
export const PIECE_UNITS = ["PIECE", "BOTTLE", "CAN", "BOX"] as const;

const OWN_WORDS: Record<string, string> = {
  GRAM: "g", KILOGRAM: "kg", MILLILITER: "ml", LITER: "lít",
  // One word per code: a pack is "gói" (bó is not told apart), a piece "cái" unless the product says "quả"...
  PIECE: "cái", PACK: "gói", BOTTLE: "chai", CAN: "lon", BOX: "hộp",
};
/** Older free-text units ("g", "Kg", "gói") as codes. */
const ALIASES: Record<string, string> = { g: "GRAM", gram: "GRAM", kg: "KILOGRAM", ml: "MILLILITER", l: "LITER", "lít": "LITER", "gói": "PACK", "chai": "BOTTLE", "lon": "CAN", "hộp": "BOX", "cái": "PIECE", "quả": "PIECE" };

const codeOf = (unit: string): string => {
  const trimmed = unit.trim();
  const upper = trimmed.toUpperCase();
  return OWN_WORDS[upper] ? upper : ALIASES[trimmed.toLowerCase()] ?? upper;
};

export const isPieceUnit = (unit: string): boolean => (PIECE_UNITS as readonly string[]).includes(codeOf(unit));

/** Word for one unit: the product's own word for piece-type units ("quả", "bìa"), else the unit's word. */
export function unitWord(unit: string, unitLabel?: string | null): string {
  const code = codeOf(unit);
  if (unitLabel && isPieceUnit(code) && (UNIT_WORDS as readonly string[]).includes(unitLabel)) return unitLabel;
  return OWN_WORDS[code] ?? unit.trim();
}

const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

/** Approximate weight or volume: "1,2 kg" / "450 g", or "1 lít" / "500 ml" (decimal comma). */
export function formatWeight(amount: number, volume = false): string {
  if (amount >= 1000) return `${formatQuantity(twoDecimals(amount / 1000))} ${volume ? "lít" : "kg"}`;
  return `${formatQuantity(Math.round(amount))} ${volume ? "ml" : "g"}`;
}

/** Product card unit line: "1 kg", "1 gói", "1 quả ≈ 1,2 kg", "1 chai ≈ 500 ml" (weight only for piece-type units). */
export function unitLine(product: { unit: string; unitLabel?: string | null; packGrams?: number | null }): string {
  const code = codeOf(product.unit);
  const base = `1 ${unitWord(code, product.unitLabel)}`;
  if (isPieceUnit(code) && product.packGrams && product.packGrams > 0) return `${base} ≈ ${formatWeight(product.packGrams, code === "BOTTLE")}`;
  return base;
}

/** An amount with its unit word: "0,7 kg", "1,5 kg", "2 gói", "3 quả". */
export const amountText = (quantity: number, unit: string, unitLabel?: string | null): string =>
  `${formatQuantity(quantity)} ${unitWord(unit, unitLabel)}`;
