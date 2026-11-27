import { DEFAULT_DAILY_CALORIES, MEAL_SHARES, type FamilyHealth, type MealKey } from "./family-health";

/**
 * Calorie-based meal planning (pure; covered by meal-plan.test.ts). Replaces the fixed "Số món mỗi bữa".
 *
 * Target: the family's meal target = the sum of the members' meal targets (each member: Mifflin-St Jeor TDEE × 1.375,
 * split Bữa sáng 25 % / trưa 40 % / tối 35 %; a member without a health profile counts as 2000 kcal a day; with no
 * health data at all, every member of the family counts as 2000 kcal).
 *
 * Dishes per meal (chosen by the caller's Kho score, variety, cuisine caps, allergies and conditions):
 * - Bữa sáng: 1 dish; a drink is added only when the dish cannot reach 90 % of the target.
 * - Bữa trưa / tối: a main (món mặn) + a vegetable or soup (rau / canh); a side (món xào) is added only when the meal
 *   stays under 90 % of the target. A one-dish main (bún, phở, cơm chiên: role mot_mon) is a meal on its own.
 * - Cơm trắng: the catalog has no plain rice dish, but a Vietnamese lunch / dinner with món mặn is eaten with rice, so
 *   RICE_SHARE (35 %) of that meal's energy is counted as rice (about 1,5 bát per adult) and the dishes cover the
 *   rest. One-dish meals and breakfast have no rice.
 *
 * Portions (servings = "phần" of each recipe, whole numbers ≥ 1): the dishes' share of the energy is split by role —
 * main 50 %, vegetable / soup 30 %, side 20 % (renormalised over the dishes present; breakfast dish 75 % / drink
 * 25 %) — and each dish gets share ÷ kcal per serving, kept within sensible bounds per person (SERVING_BOUNDS: e.g. a
 * vegetable 0,5–1,5 phần per person, so a 25 kcal vegetable never becomes 20 phần). Rounding then moves single
 * servings to bring the meal as close to the target as the bounds allow. A meal never aims above the target; it only
 * exceeds 115 % when even the minimum portions do (then portions shrink towards 1 each).
 * Breakfast with one dish: one serving per family member, adjusted slightly (0,75–1,25 per person) towards the target.
 */
export const RICE_SHARE = 0.35;
/**
 * Cơm trắng as a planned ingredient ("Gạo", raw grams): cooked rice ≈ 130 kcal / 100 g and 1 g raw rice gives about
 * 2,5 g cooked, so raw grams = rice kcal ÷ (1,3 × 2,5) = rice kcal ÷ 3,25, rounded up to 10 g (≈ 100 g raw, 325 kcal
 * per big bowl). It goes to "Cần mua tuần này" (catalog Gạo, kg) and leaves Kho with the meal's món mặn.
 */
export const RICE_INGREDIENT = "Gạo";
export const RAW_RICE_KCAL_PER_GRAM = 1.3 * 2.5;
export const riceGrams = (riceKcal: number): number => (riceKcal > 0 ? Math.ceil(riceKcal / RAW_RICE_KCAL_PER_GRAM / 10) * 10 : 0);
export const MIN_SHARE = 0.9;
export const MAX_SHARE = 1.15;

export type Slot = "main" | "one_dish" | "veg" | "side" | "breakfast" | "breakfast_single" | "drink";
export const SLOT_WEIGHTS: Record<Slot, number> = { main: 0.5, one_dish: 0.5, veg: 0.3, side: 0.2, breakfast: 0.75, breakfast_single: 1, drink: 0.25 };
/** Servings per person [min, max] for each slot. */
export const SERVING_BOUNDS: Record<Slot, [number, number]> = {
  main: [0.5, 2], one_dish: [0.75, 2], veg: [0.5, 1.5], side: [0.5, 1.5], breakfast: [0.5, 1.5], breakfast_single: [0.75, 1.25], drink: [0.5, 1.25],
};
/** Recipe roles each slot takes, in order of preference (null = an unclassified recipe). */
export const SLOT_ROLES: Record<"main" | "one_dish" | "veg" | "side" | "breakfast" | "drink", Array<string | null>> = {
  main: ["man"],
  one_dish: ["mot_mon", null],
  veg: ["canh", "rau"],
  side: ["xao", "man"],
  breakfast: ["sang", "mot_mon", null],
  drink: ["do_uong"],
};

const MEAL_KEYS: Record<string, MealKey> = { BREAKFAST: "breakfast", LUNCH: "lunch", DINNER: "dinner" };

/** The family's kcal target for a meal (see the file comment); 0 for meals without a target (snacks). */
export function mealTarget(health: FamilyHealth | undefined, meal: string, people: number): number {
  const key = MEAL_KEYS[meal.toUpperCase()];
  if (!key) return 0;
  const fallback = Math.round(DEFAULT_DAILY_CALORIES * MEAL_SHARES[key]);
  if (!health || health.members.length === 0) return Math.max(1, people) * fallback;
  return health.members.reduce((sum, member) => sum + (typeof member.mealTargets?.[key] === "number" ? member.mealTargets[key] : fallback), 0);
}

export type PortionDish = { kcal: number; slot: Slot };

/** Whole-number bounds for a slot and family size (at least 1 serving). */
export function servingBounds(slot: Slot, people: number): [number, number] {
  const [low, high] = SERVING_BOUNDS[slot];
  const eaters = Math.max(1, people);
  const min = Math.max(1, Math.ceil(low * eaters - 1e-9));
  const max = Math.max(min, Math.floor(high * eaters + 1e-9));
  return [min, max];
}

const total = (dishes: PortionDish[], servings: number[]): number => dishes.reduce((sum, dish, index) => sum + dish.kcal * servings[index], 0);

/**
 * Servings per dish so the dishes' kcal ≈ `target`: shares by slot weight (renormalised), clamped to the slot bounds
 * (the energy a clamped dish cannot take goes to the others), rounded, then single servings moved to get closer.
 * Single breakfast dish: starts from one serving per person. If even the minimum portions exceed MAX_SHARE of the
 * target, portions may shrink to 1 each.
 */
export function allocatePortions(dishes: PortionDish[], target: number, people: number): number[] {
  if (dishes.length === 0) return [];
  const bounds = dishes.map((dish) => servingBounds(dish.slot, people));
  // Dishes without (meaningful) energy, e.g. green tea: one per person within bounds; they take no share.
  const energetic = dishes.map((dish) => dish.kcal >= 10);
  const servings = dishes.map((dish, index) => (energetic[index] ? bounds[index][0] : Math.min(bounds[index][1], Math.max(bounds[index][0], Math.max(1, people)))));
  if (target <= 0) return dishes.map((dish, index) => (dish.slot === "breakfast_single" ? Math.min(bounds[index][1], Math.max(bounds[index][0], people)) : servings[index]));

  // Continuous water-filling over the energetic dishes.
  const continuous = servings.map((value) => value);
  let free = dishes.map((_, index) => index).filter((index) => energetic[index]);
  let remaining = target - dishes.reduce((sum, dish, index) => sum + (energetic[index] ? 0 : dish.kcal * servings[index]), 0);
  for (let round = 0; round < dishes.length + 1 && free.length > 0; round += 1) {
    const weight = free.reduce((sum, index) => sum + SLOT_WEIGHTS[dishes[index].slot], 0);
    const clamped: number[] = [];
    for (const index of free) {
      const ideal = (SLOT_WEIGHTS[dishes[index].slot] / weight) * Math.max(0, remaining) / dishes[index].kcal;
      const [min, max] = bounds[index];
      continuous[index] = ideal;
      if (ideal < min) { continuous[index] = min; clamped.push(index); } else if (ideal > max) { continuous[index] = max; clamped.push(index); }
    }
    if (clamped.length === 0) break;
    remaining -= clamped.reduce((sum, index) => sum + dishes[index].kcal * continuous[index], 0);
    free = free.filter((index) => !clamped.includes(index));
  }
  const rounded = continuous.map((value, index) => (energetic[index] ? Math.min(bounds[index][1], Math.max(bounds[index][0], Math.round(value))) : servings[index]));
  // One breakfast dish: start from one serving per person, then move towards the target within its bounds.
  dishes.forEach((dish, index) => { if (dish.slot === "breakfast_single" && energetic[index]) rounded[index] = Math.min(bounds[index][1], Math.max(bounds[index][0], people)); });

  const improve = (lower: (index: number) => number) => {
    for (let step = 0; step < 100; step += 1) {
      const now = Math.abs(total(dishes, rounded) - target);
      let bestMove: { index: number; delta: number; gap: number } | null = null;
      dishes.forEach((dish, index) => {
        if (!energetic[index]) return;
        for (const delta of [1, -1]) {
          const next = rounded[index] + delta;
          if (next < lower(index) || next > bounds[index][1]) continue;
          rounded[index] = next;
          const gap = Math.abs(total(dishes, rounded) - target);
          rounded[index] -= delta;
          if (gap < now - 1e-9 && (!bestMove || gap < bestMove.gap)) bestMove = { index, delta, gap };
        }
      });
      if (!bestMove) return;
      rounded[(bestMove as { index: number }).index] += (bestMove as { delta: number }).delta;
    }
  };
  improve((index) => bounds[index][0]);
  // Even the minimum portions are too much: allow down to 1 serving each.
  if (total(dishes, rounded) > MAX_SHARE * target) improve(() => 1);
  return rounded;
}

export type PlannedDish<T> = { slot: Slot; pick: T; kcal: number; servings: number };
export type MealPlan<T> = { dishes: Array<PlannedDish<T>>; target: number; riceKcal: number; kcal: number };

/** Cuisine as the pairing rules see it (missing = Vietnamese). */
export const cuisineOf = (cuisine: string | null | undefined): string => (cuisine && cuisine.trim() ? cuisine : "vietnam");
/** A light side for a one-plate dish: kcal per serving at most this. */
export const LIGHT_SIDE_KCAL = 250;
export type PickConstraint = { cuisine?: string; maxKcal?: number };
export type Picked<T> = { value: T; role: string | null; kcal: number | null; cuisine?: string | null };

/**
 * One meal: asks `pick` for a dish per slot (the recipe roles that slot accepts, plus a cuisine / kcal constraint) and
 * sizes the portions. `pick` is responsible for Kho score, variety, caps and health rules, and must not return a dish
 * twice. Sensible combinations (lunch / dinner):
 * - Vietnamese món mặn: + a Vietnamese canh or rau, eaten with rice ("Kèm cơm trắng"); a Vietnamese side (xào / mặn)
 *   only when still under 90 %.
 * - Foreign món mặn (western / asian): never with a Vietnamese canh / rau and never with rice; one side of the SAME
 *   cuisine only when under 90 % (or none).
 * - One-plate dish (mot_mon: phở, bún, mì, cơm chiên, Bò bít tết with fries…): alone, no canh, no rice; one light
 *   (≤ 250 kcal / serving) rau or canh of the same cuisine only when under 90 %.
 */
export function planMeal<T>(
  meal: string,
  people: number,
  target: number,
  pick: (roles: Array<string | null>, slot: Slot, constraint: PickConstraint) => Picked<T> | null,
): MealPlan<T> {
  const chosen: Array<{ slot: Slot; value: T; kcal: number; role: string | null; cuisine: string }> = [];
  // A dish without kcal data: the meal's energy is unknown, so no extra dish is added to "reach" the target.
  let unknownKcal = false;
  const take = (roles: Array<string | null>, slot: Slot, constraint: PickConstraint = {}): boolean => {
    const found = pick(roles, slot, constraint);
    if (!found) return false;
    if (found.kcal == null) unknownKcal = true;
    chosen.push({ slot, value: found.value, kcal: Math.max(0, found.kcal ?? 0), role: found.role, cuisine: cuisineOf(found.cuisine) });
    return true;
  };
  const size = (riceKcal: number) => {
    const servings = allocatePortions(chosen.map((dish) => ({ kcal: dish.kcal, slot: dish.slot })), Math.max(0, target - riceKcal), people);
    const kcal = riceKcal + chosen.reduce((sum, dish, index) => sum + dish.kcal * servings[index], 0);
    return { servings, kcal };
  };
  const finish = (riceKcal: number, sized: { servings: number[]; kcal: number }): MealPlan<T> => ({
    dishes: chosen.map((dish, index) => ({ slot: dish.slot, pick: dish.value, kcal: dish.kcal, servings: sized.servings[index] })),
    target, riceKcal, kcal: sized.kcal,
  });
  const reached = (kcal: number) => target <= 0 || unknownKcal || kcal >= MIN_SHARE * target;

  if (meal.toUpperCase() === "BREAKFAST") {
    if (!take(SLOT_ROLES.breakfast, "breakfast_single")) return { dishes: [], target, riceKcal: 0, kcal: 0 };
    let sized = size(0);
    if (!reached(sized.kcal) && take(SLOT_ROLES.drink, "drink")) {
      chosen[0].slot = "breakfast";
      sized = size(0);
    }
    return finish(0, sized);
  }

  // Lunch / dinner: the main decides the shape of the meal.
  if (!take(["man", "mot_mon"], "main") && !take(SLOT_ROLES.one_dish, "one_dish")) return { dishes: [], target, riceKcal: 0, kcal: 0 };
  const main = chosen[0];
  if (main.role === "mot_mon" || main.role == null) {
    main.slot = "one_dish";
    let sized = size(0);
    if (!reached(sized.kcal) && take(["rau", "canh"], "side", { cuisine: main.cuisine, maxKcal: LIGHT_SIDE_KCAL })) sized = size(0);
    return finish(0, sized);
  }
  if (main.cuisine !== "vietnam") {
    let sized = size(0);
    if (!reached(sized.kcal) && take(["canh", "rau", "xao", "man"], "side", { cuisine: main.cuisine })) sized = size(0);
    return finish(0, sized);
  }
  const rice = Math.round(RICE_SHARE * target);
  take(SLOT_ROLES.veg, "veg", { cuisine: "vietnam" });
  let sized = size(rice);
  if (!reached(sized.kcal) && take(SLOT_ROLES.side, "side", { cuisine: "vietnam" })) sized = size(rice);
  return finish(rice, sized);
}

/**
 * Portions for the dishes already in a meal (a dish was swapped, or an AI dish filled a slot): slots from the roles,
 * the same allocation, pairing and rice rule as planMeal (rice only for a Vietnamese món mặn meal).
 */
export function replanServings(meal: string, dishes: Array<{ role: string | null; kcal: number | null; cuisine?: string | null }>, people: number, target: number): { servings: number[]; riceKcal: number } {
  const isBreakfast = meal.toUpperCase() === "BREAKFAST";
  const slots: Slot[] = dishes.map((dish, index) => {
    if (isBreakfast) return dish.role === "do_uong" ? "drink" : dishes.length === 1 ? "breakfast_single" : "breakfast";
    if (dish.role === "mot_mon" || dish.role == null) return index === 0 || !dishes.some((other) => other.role === "man") ? "one_dish" : "side";
    if (dish.role === "canh" || dish.role === "rau") return dishes.some((other) => other.role === "man") ? "veg" : "side";
    if (dish.role === "man") return dishes.slice(0, index).some((other) => other.role === "man") ? "side" : "main";
    return "side";
  });
  const mainIndex = slots.indexOf("main");
  const riceKcal = !isBreakfast && mainIndex >= 0 && cuisineOf(dishes[mainIndex].cuisine) === "vietnam" ? Math.round(RICE_SHARE * target) : 0;
  return { servings: allocatePortions(dishes.map((dish, index) => ({ kcal: Math.max(0, dish.kcal ?? 0), slot: slots[index] })), Math.max(0, target - riceKcal), people), riceKcal };
}
