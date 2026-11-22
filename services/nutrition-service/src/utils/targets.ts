import { calculateDailyCalories, type NutritionMeasurements } from "./nutrition-calculator";

/**
 * Daily and per-meal energy / macro targets, shared by every place that needs targets (daily stats, suggestions,
 * the internal family profile route; exported for reuse by other services' ports).
 *
 * TDEE = Mifflin-St Jeor BMR x activity factor (new profiles are LIGHTLY_ACTIVE = 1.375; the activity field is
 * hidden, older profiles keep their stored level). Macros: 20 % protein, 55 % carbs, 25 % fat of the energy
 * (4 / 4 / 9 kcal per gram). Meals: Bữa sáng 25 %, Bữa trưa 40 %, Bữa tối 35 %. Without a profile: 2000 kcal.
 */
export const MACRO_SPLIT = { protein: 0.2, carbs: 0.55, fat: 0.25 } as const;
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;
export const MEAL_SHARES = { breakfast: 0.25, lunch: 0.4, dinner: 0.35 } as const;
export const DEFAULT_DAILY_CALORIES = 2000;

export type Meal = keyof typeof MEAL_SHARES;
/** Calories (kcal, whole number) and macros (grams, 1 decimal). */
export type Targets = { calories: number; protein: number; carbs: number; fat: number };

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Targets for an energy amount with the shared macro split. */
export function targetsFromCalories(calories: number): Targets {
  return {
    calories: Math.round(calories),
    protein: oneDecimal((calories * MACRO_SPLIT.protein) / KCAL_PER_GRAM.protein),
    carbs: oneDecimal((calories * MACRO_SPLIT.carbs) / KCAL_PER_GRAM.carbs),
    fat: oneDecimal((calories * MACRO_SPLIT.fat) / KCAL_PER_GRAM.fat),
  };
}

/** Unrounded TDEE of a profile, or the default when there is none. */
export function tdeeOf(profile: NutritionMeasurements | null): number {
  return profile ? calculateDailyCalories(profile).tdee : DEFAULT_DAILY_CALORIES;
}

/** Daily targets of a profile (defaults without one). */
export function dailyTargets(profile: NutritionMeasurements | null): Targets {
  return targetsFromCalories(tdeeOf(profile));
}

/** Bữa sáng / trưa / tối targets from the daily energy, by the shared meal shares. */
export function mealTargets(profile: NutritionMeasurements | null): Record<Meal, Targets> {
  const tdee = tdeeOf(profile);
  return {
    breakfast: targetsFromCalories(tdee * MEAL_SHARES.breakfast),
    lunch: targetsFromCalories(tdee * MEAL_SHARES.lunch),
    dinner: targetsFromCalories(tdee * MEAL_SHARES.dinner),
  };
}

/** One "average" meal (a third of the day), for scoring a single dish without a meal type. */
export function averageMealTargets(profile: NutritionMeasurements | null): Targets {
  return targetsFromCalories(tdeeOf(profile) / Object.keys(MEAL_SHARES).length);
}
