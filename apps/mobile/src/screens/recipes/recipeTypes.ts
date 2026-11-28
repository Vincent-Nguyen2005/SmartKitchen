import { unitLabel } from "../inventory/catalogSuggest";

/**
 * note: free-text amount ("vừa ăn"); isSeasoning: pantry staple shown under "Gia vị"; perPerson: eaten one per person
 * (scaled per person for a menu, see portions.ts).
 */
export type RecipeIngredient = { name: string; quantity: number | null; unit: string | null; note?: string | null; isSeasoning?: boolean; perPerson?: boolean };

/** "300 g", the free-text note ("1 muỗng canh", "vừa ăn"), or "" when neither is set. */
export const amountText = (ingredient: RecipeIngredient): string =>
  ingredient.quantity !== null && ingredient.quantity !== undefined ? `${ingredient.quantity} ${unitLabel(ingredient.unit)}`.trim() : ingredient.note?.trim() ?? "";
export type RecipeStep = {
  order: number;
  instruction: string;
  /** Timer for the step; null = "do it, then go to the next step". */
  durationSeconds: number | null;
  ingredients: RecipeIngredient[];
};
export type Recipe = {
  id: string;
  name: string;
  description?: string | null;
  ingredients: string[];
  ingredientDetails?: RecipeIngredient[] | null;
  mealTypes: string[];
  dietaryTags: string[];
  preparationMinutes?: number | null;
  servings?: number | null;
  /** Set by the admin (Quản trị > Món ăn); the shared placeholder shows when missing or broken. */
  imageUrl?: string | null;
  steps?: RecipeStep[] | null;
  /** Per serving (recipe-service); missing values count as 0 when logged. */
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  /** recipe-service dish role (man, canh, rau, mot_mon…) and cuisine (vietnam, western, asian); used for the meal's rice. */
  role?: string | null;
  cuisine?: string | null;
  /** Set by scaleRecipe: quantities are for this many people (detail / cooking mode from Lịch and Nấu ăn). */
  portionPeople?: number;
  /** Planned-servings text for a menu dish: "Đủ cho 4 người" (meal with several dishes) or "4 phần" (mealPortions.ts). */
  portionLabel?: string;
  /** Meal note under the header, e.g. "Kèm cơm trắng" (the món mặn of a meal with rice). */
  mealNote?: string;
};

/** Structured ingredients, or the plain names without quantities for older recipes. */
export const recipeIngredients = (recipe: Recipe): RecipeIngredient[] =>
  recipe.ingredientDetails?.length ? recipe.ingredientDetails : recipe.ingredients.map((name) => ({ name, quantity: null, unit: null }));

export const sortedSteps = (recipe: Recipe): RecipeStep[] => [...(recipe.steps ?? [])].sort((left, right) => left.order - right.order);

/** Sum of the step timers in seconds (0 when no step has a timer). */
export const stepsSeconds = (recipe: Recipe): number => (recipe.steps ?? []).reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0);

/** Total time in minutes: the timed steps when there are any, else the recipe's preparation time; null if unknown. */
export function totalMinutes(recipe: Recipe): number | null {
  const seconds = stepsSeconds(recipe);
  if (seconds > 0) return Math.max(1, Math.round(seconds / 60));
  return recipe.preparationMinutes ?? null;
}

/** "1 giờ 15 phút", "45 phút". */
export function minutesText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} phút`;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

/** A step timer as text: "1 phút 30 giây", "45 giây", "1 giờ". */
export function durationText(seconds: number): string {
  if (seconds >= 3600 && seconds % 60 === 0) return minutesText(seconds / 60);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} giây`;
  return rest === 0 ? `${minutes} phút` : `${minutes} phút ${rest} giây`;
}

/** Countdown display mm:ss (or h:mm:ss over an hour). */
export function clockText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
