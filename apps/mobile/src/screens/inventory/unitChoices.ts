/**
 * Kho unit words. The picker offers specific words (no combined "gói/bó" or "cái/quả"); each maps to the stored unit
 * enum plus, for pieces, the word itself (FoodItem.unitLabel). Display: the linked catalog product's word, else the
 * word the user chose, else the unit's own word. Pure (no React Native), covered by unitChoices.test.ts.
 */
import type { InventoryUnit } from "./inventoryApi";
import { unitWord } from "../shopping-cart/unitDisplay";
import { formatQuantity } from "../shopping-cart/quantityRule";

/** Words for one piece that Kho can store (PIECE + unitLabel); "cái" is PIECE's own word (stored as null). */
export const PIECE_WORDS = ["cái", "quả", "trái", "bìa", "nải"] as const;

export type UnitChoice = { label: string; unit: InventoryUnit; unitLabel: string | null };

/** Picker options, in this order: gói, cái, quả, trái, bìa, nải, hộp, chai, lon, g, kg, ml, lít. */
export const UNIT_CHOICES: readonly UnitChoice[] = [
  { label: "gói", unit: "PACK", unitLabel: null },
  { label: "cái", unit: "PIECE", unitLabel: null },
  { label: "quả", unit: "PIECE", unitLabel: "quả" },
  { label: "trái", unit: "PIECE", unitLabel: "trái" },
  { label: "bìa", unit: "PIECE", unitLabel: "bìa" },
  { label: "nải", unit: "PIECE", unitLabel: "nải" },
  { label: "hộp", unit: "BOX", unitLabel: null },
  { label: "chai", unit: "BOTTLE", unitLabel: null },
  { label: "lon", unit: "CAN", unitLabel: null },
  { label: "g", unit: "GRAM", unitLabel: null },
  { label: "kg", unit: "KILOGRAM", unitLabel: null },
  { label: "ml", unit: "MILLILITER", unitLabel: null },
  { label: "lít", unit: "LITER", unitLabel: null },
];

/** The piece word to store: only for PIECE, "cái" and unknown words stored as null. */
export const storedUnitLabel = (unit: string, label: string | null | undefined): string | null => {
  if (unit !== "PIECE" || !label) return null;
  const word = label.trim().toLowerCase();
  return word !== "cái" && (PIECE_WORDS as readonly string[]).includes(word) ? word : null;
};

/** The picker label (its value) for a stored unit + word: "quả" for PIECE + "quả", "cái" for PIECE + null, "kg"... */
export const choiceLabel = (unit: string, unitLabel?: string | null): string => {
  const word = storedUnitLabel(unit, unitLabel);
  const match = UNIT_CHOICES.find((choice) => choice.unit === unit && choice.unitLabel === word);
  return match?.label ?? unitWord(unit);
};

/** The stored unit + word for a picker label; null for an unknown label. */
export const choiceFor = (label: string): UnitChoice | null => UNIT_CHOICES.find((choice) => choice.label === label) ?? null;

/**
 * The word shown for a Kho row: the linked catalog product's word for piece-type units, else the row's own word,
 * else the unit's word ("gói", "kg", "cái"). Never a combined label.
 */
export const kitchenUnitWord = (item: { unit: string; unitLabel?: string | null }, catalogUnitLabel?: string | null): string =>
  unitWord(item.unit, catalogUnitLabel || item.unitLabel || null);

/** "1 gói", "2 quả", "1,5 kg" (decimal comma). */
export const kitchenAmount = (item: { quantity: number; unit: string; unitLabel?: string | null }, catalogUnitLabel?: string | null): string =>
  `${formatQuantity(item.quantity)} ${kitchenUnitWord(item, catalogUnitLabel)}`;
