import { Prisma, type PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { ingredientNames, seedRecipes, seedRole, type SeedRecipe } from "./recipes.data";
import { stepsFor } from "./recipe-steps.data";
import { seasoningsFor, seasoningText } from "./seasonings.data";

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
  cuisine: recipe.cuisine ?? "vietnam",
});

/**
 * Adds the starter recipes whose name is not in the table yet (and was not deleted by an admin). Never updates or
 * deletes a row, so admin edits are kept; running it again adds nothing. Returns how many rows were created.
 */
export async function seedMissingRecipes(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<number> {
  const existing = await client.recipe.findMany({ select: { name: true } });
  // Starter dishes an admin deleted for good (tombstones) count as present, so they are not created again.
  const deleted = await client.deletedStarterRecipe.findMany({ select: { nameKey: true } });
  const names = new Set([...existing.map((row) => row.name.trim().toLocaleLowerCase("vi")), ...deleted.map((row) => row.nameKey)]);
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

type StoredIngredient = { name: string; quantity?: number | null; unit?: string | null; note?: string | null; isSeasoning?: boolean };
type StoredStep = { order: number; instruction: string; durationSeconds: number | null; ingredients: StoredIngredient[] };

const SEASON_WORD = /nêm/i;

/**
 * Gives starter dishes their seasonings (muối, nước mắm, đường, tiêu, dầu ăn...) as extra ingredient lines with
 * isSeasoning=true and free-text amounts. Only adds missing lines; never changes or deletes existing ingredients.
 * A dish that already has any seasoning line is skipped (so running it again changes nothing).
 * Steps: only when they are still exactly the starter steps (not edited by an admin), the step that already says
 * "nêm" gets the amounts appended and the seasonings as its ingredients.
 * Returns how many recipes were updated.
 */
export async function fillSeasonings(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<number> {
  const rows = await client.recipe.findMany({ select: { id: true, name: true, ingredientDetails: true, steps: true } });
  let updated = 0;
  for (const row of rows) {
    const seed = recipes.find((recipe) => nameKey(recipe.name) === nameKey(row.name));
    if (!seed) continue;
    const details = Array.isArray(row.ingredientDetails) ? row.ingredientDetails as StoredIngredient[] : [];
    if (details.some((entry) => entry?.isSeasoning)) continue;
    const have = new Set(details.map((entry) => nameKey(String(entry?.name ?? ""))));
    const lines = seasoningsFor(seed).filter((entry) => !have.has(nameKey(entry.name)));
    if (lines.length === 0) continue;

    const data: { ingredientDetails: Prisma.InputJsonValue; steps?: Prisma.InputJsonValue } = {
      ingredientDetails: [...details, ...lines] as unknown as Prisma.InputJsonValue,
    };
    const original = stepsFor(seed);
    // Compared by content (JSONB does not keep key order): instruction, timer and ingredient names per step.
    const shape = (steps: unknown) => JSON.stringify(Array.isArray(steps)
      ? (steps as StoredStep[]).map((step) => [step.instruction, step.durationSeconds ?? null, (step.ingredients ?? []).map((entry) => entry.name)])
      : null);
    const unedited = original !== null && shape(row.steps) === shape(original);
    if (unedited) {
      const steps = (row.steps as unknown as StoredStep[]).map((step) => ({ ...step }));
      const target = steps.find((step) => SEASON_WORD.test(step.instruction));
      const text = seasoningText(lines);
      if (target && text) {
        target.instruction = `${target.instruction} (${text})`;
        target.ingredients = [...target.ingredients, ...lines.filter((entry) => !["Dầu ăn"].includes(entry.name))];
        data.steps = steps as unknown as Prisma.InputJsonValue;
      }
    }
    await client.recipe.update({ where: { id: row.id }, data });
    updated += 1;
  }
  return updated;
}
