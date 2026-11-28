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
type Carrier = { role?: string | null; cuisine?: string | null } | null | undefined;
/**
 * Same rule as menu-service storedRiceGrams: details.riceGrams; menus saved before rice became an ingredient only
 * have riceKcal, which counts (÷ 3,25, up to 10 g) only when the carrying dish is a Vietnamese món mặn.
 */
const riceOf = (item: ItemLike, carrier?: Carrier): number => {
  const record = typeof item.details === "object" && item.details !== null ? item.details as { riceGrams?: unknown; riceKcal?: unknown; role?: unknown } : {};
  if (typeof record.riceGrams === "number") return record.riceGrams > 0 ? record.riceGrams : 0;
  const kcal = typeof record.riceKcal === "number" ? record.riceKcal : 0;
  const role = carrier?.role ?? (typeof record.role === "string" ? record.role : null);
  return kcal > 0 && role === "man" && (carrier?.cuisine ?? "vietnam") === "vietnam" ? Math.ceil(kcal / 3.25 / 10) * 10 : 0;
};

/** The dish carries the meal's rice (raw Gạo grams), else 0. `carrier`: its recipe (role, cuisine) when known. */
export const dishRiceGrams = (item: ItemLike | null | undefined, carrier?: Carrier): number => (item ? riceOf(item, carrier) : 0);

/** A meal (its dishes) is eaten with rice: "Kèm cơm trắng". `recipeOf`: the dish's recipe (role, cuisine) when known. */
export const mealHasRice = (items: ItemLike[], recipeOf?: (item: ItemLike) => Carrier): boolean => items.some((item) => riceOf(item, recipeOf?.(item)) > 0);

/** The dish's recipe with the meal's rice added as "Gạo" (and the "Kèm cơm trắng" note); unchanged without rice. */
export function withRice(recipe: Recipe, grams: number): Recipe {
  if (!(grams > 0)) return recipe;
  return {
    ...recipe,
    mealNote: RICE_NOTE,
    ingredientDetails: [...(recipe.ingredientDetails ?? []), { name: RICE_INGREDIENT, quantity: grams, unit: "GRAM" }],
  };
}
