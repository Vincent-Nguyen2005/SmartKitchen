/**
 * Cart quantity rules for products sold in Đi chợ:
 * - KILOGRAM: steps of 0.1 kg, from 0.1 to KG_MAX (e.g. 1.5 kg of meat).
 * - Count units of a catalog product (PIECE, PACK, BOTTLE, CAN, BOX with a productId): whole numbers.
 * Other lines (free text, recipe amounts in g / ml / l, or a fraction of a piece without a catalog product) keep
 * any positive quantity.
 */
export const KG_STEP = 0.1;
export const KG_MAX = 20;
const COUNT_UNITS = new Set(["PIECE", "PACK", "BOTTLE", "CAN", "BOX"]);
const EPSILON = 1e-9;

/** Problem message for this quantity, or null when it is allowed. */
export const quantityProblem = (quantity: number, unit: string, fromCatalog: boolean): string | null => {
  if (unit === "KILOGRAM") {
    const steps = quantity / KG_STEP;
    if (Math.abs(steps - Math.round(steps)) > EPSILON * Math.max(1, steps)) return "Kilogram quantities go in steps of 0.1 kg";
    if (quantity < KG_STEP - EPSILON || quantity > KG_MAX + EPSILON) return `Kilogram quantities must be between ${KG_STEP} and ${KG_MAX} kg`;
    return null;
  }
  if (fromCatalog && COUNT_UNITS.has(unit) && !Number.isInteger(quantity)) return "This product is sold in whole units";
  return null;
};

/** Merged kg line (Đi chợ adds to the same product): on the 0.1 grid and never above KG_MAX. */
export const mergedQuantity = (quantity: number, unit: string): number =>
  unit === "KILOGRAM" ? Math.min(KG_MAX, Math.round(quantity * 10) / 10) : quantity;
