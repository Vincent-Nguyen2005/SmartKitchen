import {
  PrismaClient,
  type NutritionProfile,
} from ".prisma/client-nutrition";
import {
  dailyMealSummarySchema,
  recipeSchema,
  type RecipeDto,
} from "../dto/nutrition.dto";
import { averageMealTargets, dailyTargets, type Targets } from "../utils/targets";
import { ageFromBirthDate, dayOf } from "../utils/age";
import { z } from "zod";

const prisma = new PrismaClient();

export class NutritionProfileNotFoundError extends Error {}

export class NutritionUpstreamError extends Error {}

type NutritionGoals = Targets;

/** Daily targets from the shared helper (Mifflin-St Jeor TDEE; 20 / 55 / 25 macro split). */
function calculateGoals(profile: NutritionProfile): NutritionGoals {
  return dailyTargets(profile);
}

async function getProfile(userId: string): Promise<NutritionProfile> {
  const profile = await prisma.nutritionProfile.findUnique({ where: { userId } });
  if (!profile) throw new NutritionProfileNotFoundError();
  // A stored birth date gives the current age (targets follow birthdays).
  return profile.birthDate ? { ...profile, age: ageFromBirthDate(dayOf(profile.birthDate)) } : profile;
}

async function getUpstreamJson(
  baseUrl: string | undefined,
  path: string,
  userId?: string,
): Promise<unknown> {
  if (!baseUrl) {
    throw new NutritionUpstreamError("An upstream service URL is not configured.");
  }

  let response: globalThis.Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      headers: userId ? { "X-User-Id": userId } : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new NutritionUpstreamError("An upstream service could not be reached.");
  }

  if (!response.ok) {
    throw new NutritionUpstreamError(`An upstream service returned ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new NutritionUpstreamError("An upstream service returned invalid JSON.");
  }
}

async function getDailyMealSummary(userId: string, date: string) {
  const value = await getUpstreamJson(
    process.env.MEAL_DIARY_SERVICE_URL,
    `/api/meal-diary/daily-summary?date=${encodeURIComponent(date)}`,
    userId,
  );
  const summary = dailyMealSummarySchema.safeParse(value);
  if (!summary.success || summary.data.date !== date) {
    throw new NutritionUpstreamError("Meal diary returned an invalid daily summary.");
  }
  return summary.data;
}

export async function getDailyNutritionStats(userId: string, date: string) {
  const profile = await getProfile(userId);
  const summary = await getDailyMealSummary(userId, date);
  const goals = calculateGoals(profile);
  const percent = (actual: number, target: number) =>
    target > 0 ? Math.round((actual / target) * 1000) / 10 : 0;

  return {
    date,
    totalCalories: summary.totalCalories,
    totalProtein: summary.totalProtein,
    totalCarbs: summary.totalCarbs,
    totalFat: summary.totalFat,
    targets: goals,
    completionPercent: {
      calories: percent(summary.totalCalories, goals.calories),
      protein: percent(summary.totalProtein, goals.protein),
      carbs: percent(summary.totalCarbs, goals.carbs),
      fat: percent(summary.totalFat, goals.fat),
    },
  };
}

function normalizeTag(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How close one dish is to an average meal (a third of the day; suggestions have no meal type). */
function nutritionMatchScore(recipe: RecipeDto, mealTarget: NutritionGoals): number {
  const closeness = [
    1 - Math.min(1, Math.abs(recipe.calories - mealTarget.calories) / mealTarget.calories),
    1 - Math.min(1, Math.abs(recipe.protein - mealTarget.protein) / mealTarget.protein),
    1 - Math.min(1, Math.abs(recipe.carbs - mealTarget.carbs) / mealTarget.carbs),
    1 - Math.min(1, Math.abs(recipe.fat - mealTarget.fat) / mealTarget.fat),
  ];
  return Math.round((closeness.reduce((sum, value) => sum + value, 0) / 4) * 100);
}

export async function getPersonalizedSuggestions(userId: string) {
  const profile = await getProfile(userId);
  const [userAllergies, userConditions, recipeResponse] = await Promise.all([
    prisma.userAllergy.findMany({
      where: { userId },
      select: { allergy: { select: { name: true } } },
    }),
    prisma.userHealthCondition.findMany({
      where: { userId },
      select: { condition: { select: { name: true } } },
    }),
    getUpstreamJson(process.env.RECIPE_SERVICE_URL, "/api/recipe"),
  ]);
  const recipesResult = z.array(recipeSchema).safeParse(recipeResponse);
  if (!recipesResult.success) {
    throw new NutritionUpstreamError("Recipe service returned invalid recipe data.");
  }

  const blockedAllergens = new Set(
    userAllergies.map(({ allergy }) => normalizeTag(allergy.name)),
  );
  const blockedConditions = new Set(
    userConditions.map(({ condition }) => normalizeTag(condition.name)),
  );
  const mealTarget = averageMealTargets(profile);

  const suggestions = recipesResult.data
    .filter((recipe) => recipe.isActive)
    .filter(
      (recipe) =>
        !recipe.allergens.some((tag) => blockedAllergens.has(normalizeTag(tag))) &&
        !recipe.contraindications.some((tag) =>
          blockedConditions.has(normalizeTag(tag)),
        ),
    )
    .map((recipe) => ({
      ...recipe,
      nutritionScore: nutritionMatchScore(recipe, mealTarget),
    }))
    .sort(
      (first, second) =>
        second.nutritionScore - first.nutritionScore ||
        first.name.localeCompare(second.name),
    );

  return {
    targetPerMeal: {
      calories: mealTarget.calories,
      protein: Math.round(mealTarget.protein),
      carbs: Math.round(mealTarget.carbs),
      fat: Math.round(mealTarget.fat),
    },
    excludedAllergens: [...blockedAllergens],
    excludedHealthConditions: [...blockedConditions],
    suggestions,
  };
}
