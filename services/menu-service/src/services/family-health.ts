import { normalizeName, sameIngredient } from "./kho-suggest";

/**
 * Family health rules for menus (pure functions, easy to test).
 *
 * - Allergies: a dish is excluded for the whole family when ANY member is allergic to it: one of its allergen tags
 *   equals a member's allergy (accent- and case-insensitive), or one of its ingredient names matches the allergy
 *   with the same rule Kho matching uses ("Tôm" matches "Tôm sú"; one-word names keep accents, so "Cá" is not
 *   "Cà chua").
 * - Health conditions: a dish whose contraindication tags equal a member's condition is "unsuitable" for that member.
 *   Menus first use only dishes suitable for everyone; an unsuitable dish is used only when a slot cannot be filled
 *   otherwise, and then carries warnings naming the members and one alternative dish for them.
 * - Calories: the family target of a meal is the sum of the members' meal targets (Bữa sáng 25 %, trưa 40 %,
 *   tối 35 % of each TDEE; 2000 kcal for members without a profile); meal-plan.ts sizes dishes and portions from it.
 */
export type MealKey = "breakfast" | "lunch" | "dinner";
export type MemberHealth = {
  userId: string;
  /** Display name for warnings (null when unknown). */
  name: string | null;
  allergies: string[];
  conditions: string[];
  /** kcal per meal. */
  mealTargets: Record<MealKey, number>;
};
/** missing: no health data was ever loaded for this family (defaults used; the menu shows a notice). */
export type FamilyHealth = { members: MemberHealth[]; missing?: boolean };
export type HealthWarning = { memberUserId: string; memberName: string; condition: string };
/** The parts of a recipe the rules look at. */
export type HealthRecipe = { ingredients: Array<{ name: string }>; allergens?: string[]; contraindications?: string[] };

/** Same split as nutrition-service src/utils/targets.ts (2000 kcal default, meals 25 / 40 / 35). */
export const DEFAULT_DAILY_CALORIES = 2000;
export const MEAL_SHARES: Record<MealKey, number> = { breakfast: 0.25, lunch: 0.4, dinner: 0.35 };
export const defaultMealTargets = (): Record<MealKey, number> => ({
  breakfast: Math.round(DEFAULT_DAILY_CALORIES * MEAL_SHARES.breakfast),
  lunch: Math.round(DEFAULT_DAILY_CALORIES * MEAL_SHARES.lunch),
  dinner: Math.round(DEFAULT_DAILY_CALORIES * MEAL_SHARES.dinner),
});
export const UNKNOWN_MEMBER_NAME = "Thành viên";

const sameTag = (left: string, right: string): boolean => {
  const a = normalizeName(left);
  return a.length > 0 && a === normalizeName(right);
};

/** True when the dish contains something one of these allergies forbids (tags or ingredient names). */
export function hasAllergen(recipe: HealthRecipe, allergies: string[]): boolean {
  return allergies.some((allergy) => (recipe.allergens ?? []).some((tag) => sameTag(tag, allergy))
    || recipe.ingredients.some((ingredient) => sameIngredient(ingredient.name, allergy)));
}

/** True when any member is allergic to the dish (the family-wide hard exclusion). */
export const familyAllergic = (recipe: HealthRecipe, health: FamilyHealth): boolean =>
  health.members.some((member) => hasAllergen(recipe, member.allergies));

/** Members for whom the dish is unsuitable, with the condition (one warning per member and condition). */
export function conditionWarnings(recipe: HealthRecipe, health: FamilyHealth): HealthWarning[] {
  const tags = recipe.contraindications ?? [];
  return health.members.flatMap((member) => member.conditions
    .filter((condition) => tags.some((tag) => sameTag(tag, condition)))
    .map((condition) => ({ memberUserId: member.userId, memberName: member.name?.trim() || UNKNOWN_MEMBER_NAME, condition })));
}

/** Family kcal target for a meal (BREAKFAST / LUNCH / DINNER): the sum of the members' meal targets. */
export function familyMealTarget(health: FamilyHealth | undefined, meal: string): number {
  const key = ({ BREAKFAST: "breakfast", LUNCH: "lunch", DINNER: "dinner" } as Record<string, MealKey>)[meal.toUpperCase()];
  if (!health || !key) return 0;
  return health.members.reduce((sum, member) => sum + (member.mealTargets[key] ?? 0), 0);
}
