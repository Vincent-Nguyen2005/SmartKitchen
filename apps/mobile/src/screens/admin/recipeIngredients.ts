/**
 * Recipe editor ingredient rows → what is saved (pure; covered by recipeIngredients.test.ts). "Theo người" (perPerson)
 * is no longer shown in the editor: a loaded ingredient keeps its stored value and is saved with it unchanged; a new
 * ingredient keeps the default (false). Menu scaling is not touched.
 */
export type SavedIngredient = { name: string; quantity: number | null; unit: string | null; note: string | null; isSeasoning?: boolean; perPerson: boolean };
export type IngredientRow = { name: string; quantity: string; unit: string; isSeasoning: boolean; perPerson: boolean };

/** Default for a new row (no stored value). */
export const DEFAULT_PER_PERSON = false;

/** One row → its saved detail, or the error message to show. */
export function savedIngredient(row: IngredientRow): { detail: SavedIngredient } | { error: string } {
  const amount = row.quantity.trim();
  const quantity = /^[0-9]+([.,][0-9]+)?$/.test(amount) ? Number(amount.replace(",", ".")) : null;
  if (quantity !== null && quantity <= 0) return { error: `Số lượng của "${row.name.trim()}" phải lớn hơn 0.` };
  // Not a number: kept as the free-text amount ("vừa ăn", "1 muỗng canh").
  const note = quantity === null && amount ? amount.slice(0, 40) : null;
  // perPerson is always saved (true or false), so the starter-data step never changes an admin's choice.
  return { detail: { name: row.name.trim(), quantity, unit: quantity === null ? null : row.unit, note, ...(row.isSeasoning ? { isSeasoning: true } : {}), perPerson: row.perPerson } };
}
