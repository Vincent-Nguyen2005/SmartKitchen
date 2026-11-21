import { Prisma, type PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { ingredientNames, seedRecipes, seedRole, type SeedRecipe } from "./recipes.data";
import { stepsFor } from "./recipe-steps.data";

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
  steps: stepsFor(recipe) ?? Prisma.DbNull,
  role: seedRole(recipe),
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

const nameKey = (name: string) => name.trim().toLocaleLowerCase("vi");

/**
 * Data migration for databases seeded before steps existed: gives each starter dish (matched by name) its steps,
 * only where the row has no steps yet. Never overwrites steps an admin wrote; running it again changes nothing.
 * Returns how many rows got steps.
 */
export async function fillMissingSteps(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<number> {
  const rows = await client.recipe.findMany({ where: { steps: { equals: Prisma.DbNull } }, select: { id: true, name: true } });
  let filled = 0;
  for (const row of rows) {
    const seed = recipes.find((recipe) => nameKey(recipe.name) === nameKey(row.name));
    const steps = seed ? stepsFor(seed) : null;
    if (!steps) continue;
    // The condition is repeated in the update, so a row edited meanwhile is left alone.
    const result = await client.recipe.updateMany({ where: { id: row.id, steps: { equals: Prisma.DbNull } }, data: { steps } });
    filled += result.count;
  }
  return filled;
}

/**
 * Gives starter dishes (matched by name) their meal role where the row has no role yet. Never overwrites a role
 * an admin set; running it again changes nothing. Returns how many rows got a role.
 */
export async function fillMissingRoles(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<number> {
  const rows = await client.recipe.findMany({ where: { role: null }, select: { id: true, name: true } });
  let filled = 0;
  for (const row of rows) {
    const seed = recipes.find((recipe) => nameKey(recipe.name) === nameKey(row.name));
    const role = seed ? seedRole(seed) : null;
    if (!role) continue;
    const result = await client.recipe.updateMany({ where: { id: row.id, role: null }, data: { role } });
    filled += result.count;
  }
  return filled;
}
