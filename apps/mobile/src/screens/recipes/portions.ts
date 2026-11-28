import type { Recipe } from "./recipeTypes";

/**
 * Portions: recipe quantities scaled to the number of people eating. Copy of menu-service
 * src/services/portions.ts (the same rules decide Kho matching and the missing list there); keep both identical.
 *
 * - people: a dish's planned portions (calorie-based menus: details.servings; older dishes: the menu's servings, i.e.
 *   the family member count when generated, else the current member count). Recipe servings null / 0 count as 1.
 * - Normal ingredient: quantity × people / recipe servings (unchanged when people = servings).
 * - perPerson ingredient (bánh mì, trứng ốp la, a glass of milk): each person's amount (quantity / servings) is
 *   rounded up first, then × people, so nobody gets half an egg.
 * - Seasonings scale the same way; free-text amounts ("vừa ăn") stay as text (quantity null).
 * - Rounding: pieces (cái, quả, gói, chai, lon, hộp) up to whole numbers; g / ml to the nearest 5 (at least 5);
 *   kg / lít and other units to 2 decimals.
 */
export type PortionIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  note?: string | null;
  isSeasoning?: boolean;
  perPerson?: boolean;
};

const PIECE_UNITS = new Set(["PIECE", "PACK", "BOTTLE", "CAN", "BOX"]);
const FINE_UNITS = new Set(["GRAM", "MILLILITER"]);

export const recipeServings = (servings: number | null | undefined): number =>
  typeof servings === "number" && Number.isFinite(servings) && servings > 0 ? servings : 1;

/** Rounds an amount for its unit (see the file comment). */
export function roundQuantity(value: number, unit: string | null | undefined): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  const code = (unit ?? "").toUpperCase();
  if (PIECE_UNITS.has(code)) return Math.ceil(value - 1e-9);
  if (FINE_UNITS.has(code)) return Math.max(5, Math.round(value / 5) * 5);
  return Math.round(value * 100) / 100;
}

/** The ingredient's quantity for `people` (null stays null: free-text amounts are not scaled). */
export function scaleQuantity(ingredient: PortionIngredient, servings: number | null | undefined, people: number): number | null {
  if (ingredient.quantity === null || ingredient.quantity === undefined) return null;
  const base = recipeServings(servings);
  const eaters = recipeServings(people);
  if (ingredient.perPerson) return roundQuantity(roundQuantity(ingredient.quantity / base, ingredient.unit) * eaters, ingredient.unit);
  if (eaters === base) return ingredient.quantity;
  return roundQuantity((ingredient.quantity * eaters) / base, ingredient.unit);
}

export function scaleIngredients<T extends PortionIngredient>(ingredients: T[], servings: number | null | undefined, people: number): T[] {
  return ingredients.map((ingredient) => ({ ...ingredient, quantity: scaleQuantity(ingredient, servings, people) }));
}

/** People a menu is cooked for: its servings, else the current family member count, else 1. */
export const menuPeople = (menuServings: number | null | undefined, memberCount?: number | null): number =>
  recipeServings(menuServings ?? memberCount ?? 1);

/**
 * Planned portions ("phần") of one menu dish: calorie-based menus store them per dish (details.servings); older
 * dishes are cooked for the menu's people. Quantities scale by these portions (one portion = one person's share).
 */
export const dishServings = (details: unknown, menuServings: number | null | undefined, memberCount?: number | null): number => {
  const planned = typeof details === "object" && details !== null ? (details as { servings?: unknown }).servings : undefined;
  return typeof planned === "number" && Number.isFinite(planned) && planned > 0 ? planned : menuPeople(menuServings, memberCount);
};


/**
 * The recipe with its ingredients and step ingredients scaled to `portions` planned servings (dish detail and cooking
 * mode from Lịch / Nấu ăn). `servings` becomes the planned portions, so the header ("4 phần"), the cards and cooking
 * mode always match the scaled amounts; `portionPeople` (the family size, default = portions) keeps "cho N người".
 * Calories stay per serving (logging = 1 portion).
 */
export function scaleRecipe(recipe: Recipe, portions: number, people: number = portions): Recipe {
  const base = recipe.servings;
  return {
    ...recipe,
    servings: recipeServings(portions),
    portionPeople: recipeServings(people),
    ingredientDetails: recipe.ingredientDetails ? scaleIngredients(recipe.ingredientDetails, base, portions) : recipe.ingredientDetails,
    steps: recipe.steps ? recipe.steps.map((step) => ({ ...step, ingredients: scaleIngredients(step.ingredients ?? [], base, portions) })) : recipe.steps,
  };
}
