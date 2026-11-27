import type { Recipe } from "./recipeTypes";

/**
 * Meal-level portion texts and the meal's rice (pure; covered by mealPortions.test.ts). Calorie-based menus
 * (menu-service meal-plan.ts):
 * - Servings label: in a meal with more than one dish (lunch / dinner) a dish's "N phần" is confusing ("2 phần" of the
 *   món mặn for 4 people), so the header, the cards and cooking mode say "Đủ cho <family size> người"; a single-dish
 *   meal (one-dish breakfast, phở) keeps "<N> phần". Amounts are always the planned ones.
 * - "Kèm cơm trắng": a lunch / dinner with món mặn includes rice; the món mặn carries it as raw Gạo grams
 *   (details.riceGrams). Its detail lists "Gạo" with that amount, so cooking it ("Hoàn thành") takes the rice out of Kho
 *   once per meal, together with the dish's ingredients.
 */
export const RICE_NOTE = "Kèm cơm trắng";
export const RICE_INGREDIENT = "Gạo";

/** "Đủ cho 4 người" (meal with several dishes) or "4 phần" (single-dish meal). */
export const portionLabel = (dishesInMeal: number, portions: number, people: number): string =>
  dishesInMeal > 1 ? `Đủ cho ${people} người` : `${portions} phần`;

type ItemLike = { mealType: string; details?: unknown };
const riceOf = (item: ItemLike): number => {
  const grams = typeof item.details === "object" && item.details !== null ? (item.details as { riceGrams?: unknown }).riceGrams : undefined;
  return typeof grams === "number" && grams > 0 ? grams : 0;
};

/** The dish carries the meal's rice (raw Gạo grams), else 0. */
export const dishRiceGrams = (item: ItemLike | null | undefined): number => (item ? riceOf(item) : 0);

/** A meal (its dishes) is eaten with rice: "Kèm cơm trắng". */
export const mealHasRice = (items: ItemLike[]): boolean => items.some((item) => riceOf(item) > 0);

/** The dish's recipe with the meal's rice added as "Gạo" (and the "Kèm cơm trắng" note); unchanged without rice. */
export function withRice(recipe: Recipe, grams: number): Recipe {
  if (!(grams > 0)) return recipe;
  return {
    ...recipe,
    mealNote: RICE_NOTE,
    ingredientDetails: [...(recipe.ingredientDetails ?? []), { name: RICE_INGREDIENT, quantity: grams, unit: "GRAM" }],
  };
}
