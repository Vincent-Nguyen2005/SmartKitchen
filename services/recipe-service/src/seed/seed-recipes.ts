import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { ingredientNames, seedRecipes, type SeedRecipe } from "./recipes.data";

const toData = (recipe: SeedRecipe) => ({
  name: recipe.name,
  description: recipe.description,
  ingredients: ingredientNames(recipe),
  ingredientDetails: recipe.ingredients,
  mealTypes: recipe.mealTypes,
  dietaryTags: recipe.dietaryTags ?? [],
  tags: recipe.tags ?? [],
  preparationMinutes: recipe.preparationMinutes,
  servings: recipe.servings,
  calories: recipe.calories,
  protein: recipe.protein,
  carbs: recipe.carbs,
  fat: recipe.fat,
  allergens: recipe.allergens ?? [],
  contraindications: recipe.contraindications ?? [],
  isActive: true,
});

/**
 * Adds the starter recipes whose name is not in the table yet. Never updates or deletes a row, so admin edits
 * are kept; running it again adds nothing. Returns how many rows were created.
 */
export async function seedMissingRecipes(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<number> {
  const existing = await client.recipe.findMany({ select: { name: true } });
  const names = new Set(existing.map((row) => row.name.trim().toLocaleLowerCase("vi")));
  const missing = recipes.filter((recipe) => !names.has(recipe.name.trim().toLocaleLowerCase("vi")));
  if (missing.length === 0) return 0;
  const result = await client.recipe.createMany({ data: missing.map(toData) });
  return result.count;
}

/** At container start: seed only when the Recipe table is empty (a fresh database). */
export async function seedRecipesIfEmpty(client: PrismaClient): Promise<number> {
  if ((await client.recipe.count()) > 0) return 0;
  return seedMissingRecipes(client);
}
