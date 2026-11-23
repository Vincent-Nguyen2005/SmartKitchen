import { healthTagsFor } from "./health-tags";
import { PER_PERSON } from "./per-person";
import { stepsFor, type SeedStep } from "./recipe-steps.data";
import { ingredientNames, seedRole, type SeedRecipe, type SeedIngredient } from "./recipes.data";
import { seasoningsFor, seasoningText, type SeasoningLine } from "./seasonings.data";

type Detail = (SeedIngredient & { perPerson?: true }) | SeasoningLine;

/**
 * The full record a starter dish ends up with on a fresh database after the startup steps (seed, seasonings with
 * their amounts in the "nêm" step, per-person flags, health tags where the seed has none). Used by the realism
 * tests and by one-off data updates of an existing database through the admin API.
 */
export function starterRecord(recipe: SeedRecipe) {
  const role = seedRole(recipe);
  const lines = seasoningsFor(recipe);
  const perPerson = new Set(PER_PERSON[recipe.name] ?? []);
  const ingredientDetails: Detail[] = [
    ...recipe.ingredients.map((ingredient) => (perPerson.has(ingredient.name) ? { ...ingredient, perPerson: true as const } : { ...ingredient })),
    ...lines,
  ];
  const steps: SeedStep[] | null = stepsFor(recipe);
  if (steps && lines.length > 0) {
    // Same rule as fillSeasonings: the first step that says "nêm" gets the amounts and the seasonings (not the oil).
    const target = steps.find((step) => /nêm/i.test(step.instruction));
    const text = seasoningText(lines);
    if (target && text) {
      target.instruction = `${target.instruction} (${text})`;
      target.ingredients = [...target.ingredients, ...lines.filter((entry) => entry.name !== "Dầu ăn")];
    }
  }
  const computed = healthTagsFor({ name: recipe.name, role, ingredientNames: ingredientDetails.map((detail) => detail.name) });
  return {
    name: recipe.name,
    description: recipe.description,
    mealTypes: [...recipe.mealTypes],
    role,
    servings: recipe.servings,
    preparationMinutes: recipe.preparationMinutes,
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    dietaryTags: recipe.dietaryTags ?? [],
    tags: recipe.tags ?? [],
    allergens: recipe.allergens?.length ? recipe.allergens : computed.allergens,
    contraindications: recipe.contraindications?.length ? recipe.contraindications : computed.contraindications,
    ingredients: [...ingredientNames(recipe), ...lines.map((entry) => entry.name)],
    ingredientDetails,
    steps,
  };
}

export type StarterRecord = ReturnType<typeof starterRecord>;
