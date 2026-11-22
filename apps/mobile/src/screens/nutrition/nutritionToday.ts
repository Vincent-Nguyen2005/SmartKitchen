import type { MealHistory, MealType } from "../meal-diary/mealDiaryApi";
import { createMealDiaryApi } from "../meal-diary/mealDiaryApi";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no daylight saving

/** Today's calendar day in Vietnam as YYYY-MM-DD, whatever the device time zone is. */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

const nameKey = (name: string) => name.trim().toLocaleLowerCase("vi");

/** One serving of a cooked dish; macros are 0 when the recipe has none (kcal only). */
export type Serving = { name: string; calories: number; protein: number; carbs: number; fat: number };

const amount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0);

export const servingOf = (dish: { name: string; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null }): Serving => ({
  name: dish.name,
  calories: amount(dish.calories),
  protein: amount(dish.protein),
  carbs: amount(dish.carbs),
  fat: amount(dish.fat),
});

/** Dish names already logged on a day (to show "Đã ăn" and ask before logging the same dish again). */
export const loggedNames = (history: MealHistory | null): Set<string> =>
  new Set((history?.meals ?? []).flatMap((meal) => meal.items.map((item) => nameKey(item.foodName))));

export const isLogged = (names: ReadonlySet<string>, dishName: string): boolean => names.has(nameKey(dishName));

/** Logs one serving to today's intake (meal-diary-service, Vietnam date, cooked at home). */
export function logServing(accessToken: string | null, serving: Serving, mealType: MealType) {
  return createMealDiaryApi(accessToken).logMeal({
    date: vnToday(),
    mealType,
    source: "HOME",
    items: [{
      foodName: serving.name,
      calories: serving.calories,
      // Missing macros are sent as 0, so the day's totals still add up.
      protein: serving.protein,
      carbs: serving.carbs,
      fat: serving.fat,
      quantity: 1,
      unit: "phần",
    }],
  });
}
