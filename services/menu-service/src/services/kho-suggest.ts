/**
 * Picks dishes from what the family has in Kho. Pure functions (no I/O) so the scoring is easy to test.
 *
 * Score of a recipe for one meal:
 *   100 × share of its ingredients available in Kho (accent-insensitive names, quantities compared when units allow)
 * + 15 per available ingredient that uses a Kho item expiring within 3 days (at most 2 counted)
 * − 10 when the dish was already planned in the 3 previous days
 * + a deterministic per-day tie-breaker below 1 point, so equal dishes vary from day to day.
 * With an empty Kho the score is popularity + a per-day rotation, so the fallback menu still varies.
 */

export const EXPIRING_WITHIN_DAYS = 3;
export const REPEAT_WINDOW_DAYS = 3;
const EXPIRING_BONUS = 15;
const MAX_EXPIRING_COUNTED = 2;
const REPEAT_PENALTY = 10;

export type KhoItem = { name: string; quantity: number | null; unit: string | null; expiryDate: string | null };
/** isSeasoning: pantry staple (muối, nước mắm, dầu ăn...), never matched against Kho or counted as missing. */
export type DishIngredient = { name: string; quantity: number | null; unit: string | null; note?: string | null; isSeasoning?: boolean };
export type SuggestRecipe = {
  id: string;
  name: string;
  imageUrl: string | null;
  calories: number | null;
  mealTypes: string[];
  tags: string[];
  ingredients: DishIngredient[];
  /** Role in a family meal (man, xao, canh, rau, trang_mieng, sang, mot_mon, do_uong); null = not classified. */
  role?: string | null;
  /** recipe-service tags for the family health rules (allergy exclusion, condition warnings). */
  allergens?: string[];
  contraindications?: string[];
};
/** Meal kcal goal while picking the dishes of one meal (see caloriePenalty in family-health.ts). */
export type MealCalorieGoal = { target: number; servings: number; planned: number };
export type DishSuggestion = {
  recipe: SuggestRecipe;
  score: number;
  availableIngredients: string[];
  missingIngredients: DishIngredient[];
  availableCount: number;
  totalCount: number;
  expiringIngredients: string[];
  reason: string;
};

/** Lower case, no Vietnamese accents (đ → d), single spaces. */
export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Lower case with accents kept (NFC), single spaces. */
const accentedName = (value: string): string => value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();

const containsTokens = (longer: string, shorter: string): boolean => {
  const words = new Set(longer.split(" "));
  return shorter.split(" ").every((word) => words.has(word));
};

/**
 * Same ingredient when, without accents, the names are equal ("trung ga" = "Trứng gà"); or when every word of
 * the shorter name is in the longer one: with accents for one-word names ("Trứng" ⊂ "Trứng gà", but "cá" is not
 * "cà chua"), accent-insensitive from two words on ("thit ba chi" ⊂ "Thịt ba chỉ heo").
 */
export function sameIngredient(left: string, right: string): boolean {
  const [a, b] = [normalizeName(left), normalizeName(right)];
  if (!a || !b) return false;
  if (a === b) return true;
  const [long, short] = a.split(" ").length >= b.split(" ").length ? [a, b] : [b, a];
  if (short.split(" ").length >= 2) return containsTokens(long, short);
  const [accLeft, accRight] = [accentedName(left), accentedName(right)];
  const [accLong, accShort] = accLeft.split(" ").length >= accRight.split(" ").length ? [accLeft, accRight] : [accRight, accLeft];
  return containsTokens(accLong, accShort);
}

const unitBase: Record<string, { group: string; factor: number }> = {
  GRAM: { group: "mass", factor: 1 },
  KILOGRAM: { group: "mass", factor: 1000 },
  MILLILITER: { group: "volume", factor: 1 },
  LITER: { group: "volume", factor: 1000 },
};

/** Quantity in a base unit (g, ml, or the count unit itself); null when it cannot be compared. */
function baseQuantity(quantity: number | null, unit: string | null): { group: string; value: number } | null {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || !unit) return null;
  const known = unitBase[unit.toUpperCase()];
  return known ? { group: known.group, value: quantity * known.factor } : { group: unit.toUpperCase(), value: quantity };
}

/** Whole days from `today` (YYYY-MM-DD, Vietnam) to the item's expiry day in Vietnam; null without a date. */
export function daysLeft(expiryDate: string | null, today: string): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const expiryDay = new Date(expiry.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${expiryDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Vietnam calendar day (YYYY-MM-DD) of an instant. */
export const vnDay = (now = new Date()): string => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Items that can be cooked: expired ones are left out (Kho still lists them until they are discarded). */
export const usableKho = (items: KhoItem[], today: string): KhoItem[] =>
  items.filter((item) => item.name.trim() && (daysLeft(item.expiryDate, today) ?? 0) >= 0);

const lowerFirst = (value: string): string => value.toLocaleLowerCase("vi");

/** Small, stable number in [0, 1) from a string: the per-day tie-breaker. */
function jitter(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

export function evaluateRecipe(recipe: SuggestRecipe, kho: KhoItem[], today: string, recentRecipeIds: ReadonlySet<string>, day: string): DishSuggestion {
  const availableIngredients: string[] = [];
  const missingIngredients: DishIngredient[] = [];
  const expiringIngredients: string[] = [];
  for (const ingredient of recipe.ingredients) {
    const matches = kho.filter((item) => sameIngredient(item.name, ingredient.name));
    if (matches.length === 0) {
      missingIngredients.push(ingredient);
      continue;
    }
    const need = baseQuantity(ingredient.quantity, ingredient.unit);
    const comparable = need ? matches.map((item) => baseQuantity(item.quantity, item.unit)).filter((have) => have?.group === need.group) : [];
    if (need && comparable.length > 0) {
      const have = comparable.reduce((sum, entry) => sum + (entry?.value ?? 0), 0);
      if (have < need.value) {
        // Not enough: the shortfall goes to Giỏ hàng, in the recipe's unit.
        const factor = unitBase[(ingredient.unit ?? "").toUpperCase()]?.factor ?? 1;
        const shortfall = Math.ceil(((need.value - have) / factor) * 100) / 100;
        missingIngredients.push({ ...ingredient, quantity: shortfall });
        continue;
      }
    }
    availableIngredients.push(ingredient.name);
    const soonest = Math.min(...matches.map((item) => daysLeft(item.expiryDate, today) ?? Number.POSITIVE_INFINITY));
    if (soonest >= 0 && soonest <= EXPIRING_WITHIN_DAYS) expiringIngredients.push(ingredient.name);
  }

  const totalCount = recipe.ingredients.length;
  const availableCount = availableIngredients.length;
  const repeated = recentRecipeIds.has(recipe.id);
  const tieBreak = jitter(`${day}:${recipe.id}`);
  let score: number;
  let reason: string;
  if (kho.length === 0) {
    score = (recipe.tags.some((tag) => normalizeName(tag) === "pho bien") ? 5 : 0) + tieBreak * 10 - (repeated ? REPEAT_PENALTY : 0);
    reason = "Kho đang trống, gợi ý món phổ biến";
  } else {
    score = (totalCount > 0 ? (availableCount / totalCount) * 100 : 0)
      + Math.min(expiringIngredients.length, MAX_EXPIRING_COUNTED) * EXPIRING_BONUS
      - (repeated ? REPEAT_PENALTY : 0)
      + tieBreak;
    const parts: string[] = [];
    if (expiringIngredients.length > 0) parts.push(`Dùng ${expiringIngredients.map(lowerFirst).join(", ")} sắp hết hạn`);
    parts.push(`Có sẵn ${availableCount}/${totalCount} nguyên liệu`);
    reason = parts.join(" · ");
  }
  return { recipe, score, availableIngredients, missingIngredients, availableCount, totalCount, expiringIngredients, reason };
}

/**
 * One dish per meal for `day`, best score first, never the same dish twice in a day.
 * Recipes without meal types fit any meal. Returns null for a meal with no suitable recipe.
 */
export function pickDishes(
  recipes: SuggestRecipe[],
  kho: KhoItem[],
  meals: string[],
  options: { today: string; day: string; recentRecipeIds: ReadonlySet<string> },
): Array<{ meal: string; suggestion: DishSuggestion | null }> {
  const used = new Set<string>();
  return meals.map((meal) => {
    const mealName = meal.toLowerCase();
    const candidates = recipes.filter((recipe) => !used.has(recipe.id) && (recipe.mealTypes.length === 0 || recipe.mealTypes.includes(mealName)));
    const best = candidates
      .map((recipe) => evaluateRecipe(recipe, kho, options.today, options.recentRecipeIds, `${options.day}:${mealName}`))
      .sort((left, right) => right.score - left.score)[0] ?? null;
    if (best) used.add(best.recipe.id);
    return { meal, suggestion: best };
  });
}


/** Dish counts per meal for a day: "Số món mỗi bữa" (defaults 3 / 5 / 5). */
export type MealCounts = { BREAKFAST: number; LUNCH: number; DINNER: number };
export const DEFAULT_MEAL_COUNTS: MealCounts = { BREAKFAST: 3, LUNCH: 5, DINNER: 5 };

/** Lunch / dinner like a Vietnamese family meal: món mặn, canh, rau, món xào, tráng miệng (first N), then more. */
const FAMILY_MEAL_ROLES = ["man", "canh", "rau", "xao", "trang_mieng"];
const EXTRA_ROLES = ["man", "xao", "canh"];

/** Role wanted for each dish slot of a meal. Breakfast: light dishes, the last one a drink when there are 2+. */
export function roleSlots(meal: string, count: number): string[] {
  if (count <= 0) return [];
  if (meal.toUpperCase() === "BREAKFAST") {
    return count === 1 ? ["sang"] : [...Array.from({ length: count - 1 }, () => "sang"), "do_uong"];
  }
  return Array.from({ length: count }, (_, index) => FAMILY_MEAL_ROLES[index] ?? EXTRA_ROLES[(index - FAMILY_MEAL_ROLES.length) % EXTRA_ROLES.length]);
}

/** Recipe fits a slot: same role; a breakfast slot takes light dishes, one-dish meals and unclassified dishes. */
export function fitsRole(recipeRole: string | null | undefined, slotRole: string | null): boolean {
  if (slotRole === null) return true;
  if (slotRole === "sang") return recipeRole === "sang" || recipeRole === "mot_mon" || recipeRole == null;
  return recipeRole === slotRole;
}

const fitsMeal = (recipe: SuggestRecipe, meal: string) => recipe.mealTypes.length === 0 || recipe.mealTypes.includes(meal.toLowerCase());

/**
 * Dishes already planned per meal on other days: key `${YYYY-MM-DD}|${MEAL}` -> recipe ids. Built from the saved
 * menus before AND after the day (and the days generated earlier in the same request).
 */
export type MealHistory = Map<string, Set<string>>;
export const historyKey = (day: string, meal: string): string => `${day}|${meal.toUpperCase()}`;
const shiftDay = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function addToHistory(history: MealHistory, day: string, meal: string, recipeId: string): void {
  const key = historyKey(day, meal);
  history.set(key, (history.get(key) ?? new Set<string>()).add(recipeId));
}

/** Recipes used in this meal within `distance` days before or after `day` (the day itself excluded). */
function usedNear(history: MealHistory, meal: string, day: string, distance: number): Set<string> {
  const used = new Set<string>();
  for (let offset = 1; offset <= distance; offset += 1) {
    history.get(historyKey(shiftDay(day, -offset), meal))?.forEach((id) => used.add(id));
    history.get(historyKey(shiftDay(day, offset), meal))?.forEach((id) => used.add(id));
  }
  return used;
}

/** How often a recipe is planned in this meal within 6 days before or after `day`. */
function usesWithinWeek(history: MealHistory, meal: string, day: string, recipeId: string): number {
  let count = 0;
  for (let offset = -6; offset <= 6; offset += 1) {
    if (offset !== 0 && history.get(historyKey(shiftDay(day, offset), meal))?.has(recipeId)) count += 1;
  }
  return count;
}

/**
 * Variety before Kho score. First choice: dishes not used in this meal in the 2 days before/after and planned at most
 * once more in that meal within the week (so at most twice in 7 days). Then: just not on the previous/next day.
 * Only when nothing else fits may a dish repeat on consecutive days.
 */
export function varietyPool(pool: SuggestRecipe[], meal: string, day: string, history?: MealHistory): SuggestRecipe[] {
  if (!history || history.size === 0) return pool;
  const nearTwo = usedNear(history, meal, day, 2);
  const strict = pool.filter((recipe) => !nearTwo.has(recipe.id) && usesWithinWeek(history, meal, day, recipe.id) < 2);
  if (strict.length > 0) return strict;
  const nearOne = usedNear(history, meal, day, 1);
  const loose = pool.filter((recipe) => !nearOne.has(recipe.id));
  return loose.length > 0 ? loose : pool;
}

/** `penalty` (calories) is subtracted from each Kho score before ranking. */
function best(candidates: SuggestRecipe[], kho: KhoItem[], options: { today: string; recentRecipeIds: ReadonlySet<string> }, seed: string, penalty?: (recipe: SuggestRecipe) => number): DishSuggestion | null {
  return candidates
    .map((recipe) => {
      const suggestion = evaluateRecipe(recipe, kho, options.today, options.recentRecipeIds, seed);
      return penalty ? { ...suggestion, score: suggestion.score - penalty(recipe) } : suggestion;
    })
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

/** Weight of the calorie term next to the Kho score (explained in family-health.ts). */
export const CALORIE_WEIGHT = 20;
/**
 * Calorie penalty (0..CALORIE_WEIGHT) of one dish against what is left of the meal's family target per remaining
 * slot: CALORIE_WEIGHT × min(1, |kcal × servings − perSlot| / perSlot). No penalty without kcal or target.
 */
export function mealCaloriePenalty(kcal: number | null | undefined, goal: MealCalorieGoal | undefined, slotsLeft: number): number {
  if (!goal || kcal == null || goal.target <= 0 || slotsLeft <= 0) return 0;
  const perSlot = (goal.target - goal.planned) / slotsLeft;
  if (perSlot <= 0) return CALORIE_WEIGHT;
  return CALORIE_WEIGHT * Math.min(1, Math.abs(kcal * goal.servings - perSlot) / perSlot);
}

/**
 * `count` dishes for one meal, one per role slot, best Kho score first. A slot with no recipe of its role takes an
 * unclassified (or one-dish) recipe for main roles; desserts, vegetables and drinks are skipped when missing.
 * Never repeats a dish within the day (`usedIds`, updated) and skips `excludeIds` (removed in the last 7 days).
 */
export function pickMealDishes(
  recipes: SuggestRecipe[],
  kho: KhoItem[],
  meal: string,
  count: number,
  options: { today: string; day: string; recentRecipeIds: ReadonlySet<string>; usedIds: Set<string>; excludeIds?: ReadonlySet<string>; history?: MealHistory; calories?: MealCalorieGoal },
): Array<{ role: string; suggestion: DishSuggestion }> {
  return pickRoleDishes(recipes, kho, meal, roleSlots(meal, count), options);
}

/** Same as pickMealDishes for an explicit list of role slots (e.g. only the slots an older menu is missing). */
export function pickRoleDishes(
  recipes: SuggestRecipe[],
  kho: KhoItem[],
  meal: string,
  roles: string[],
  options: { today: string; day: string; recentRecipeIds: ReadonlySet<string>; usedIds: Set<string>; excludeIds?: ReadonlySet<string>; history?: MealHistory; calories?: MealCalorieGoal },
): Array<{ role: string; suggestion: DishSuggestion }> {
  const picks: Array<{ role: string; suggestion: DishSuggestion }> = [];
  // Whole-meal calories: each slot aims at what is left of the family target (updated as dishes are picked).
  const goal = options.calories ? { ...options.calories } : undefined;
  roles.forEach((role, index) => {
    const open = recipes.filter((recipe) => fitsMeal(recipe, meal) && !options.usedIds.has(recipe.id) && !options.excludeIds?.has(recipe.id));
    let pool = open.filter((recipe) => fitsRole(recipe.role, role));
    if (pool.length === 0 && ["man", "canh", "xao"].includes(role)) pool = open.filter((recipe) => recipe.role == null || recipe.role === "mot_mon");
    const slotsLeft = roles.length - index;
    const pick = best(varietyPool(pool, meal, options.day, options.history), kho, options, `${options.day}:${meal.toLowerCase()}:${index}`,
      goal ? (recipe) => mealCaloriePenalty(recipe.calories, goal, slotsLeft) : undefined);
    if (!pick) return;
    options.usedIds.add(pick.recipe.id);
    if (goal && pick.recipe.calories != null) goal.planned += pick.recipe.calories * goal.servings;
    picks.push({ role, suggestion: pick });
  });
  return picks;
}

/**
 * One replacement for a removed dish: same meal and role (any role when the removed dish had none), best Kho score,
 * excluding `excludeIds` (dishes already in the day, removed recently, the removed dish). Null when nothing fits.
 */
export function pickReplacement(
  recipes: SuggestRecipe[],
  kho: KhoItem[],
  meal: string,
  role: string | null,
  options: { today: string; day: string; excludeIds: ReadonlySet<string>; history?: MealHistory },
): DishSuggestion | null {
  const pool = recipes.filter((recipe) => fitsMeal(recipe, meal) && !options.excludeIds.has(recipe.id)
    && (role === null ? true : role === "sang" ? fitsRole(recipe.role, "sang") : recipe.role === role));
  return best(varietyPool(pool, meal, options.day, options.history), kho, { today: options.today, recentRecipeIds: new Set() }, `${options.day}:${meal.toLowerCase()}:replace`);
}
