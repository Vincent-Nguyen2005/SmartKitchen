import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { healthTagsFor } from "../seed/health-tags";
import { seedRecipes } from "../seed/recipes.data";
import { seedMissingRecipes } from "../seed/seed-recipes";
import { starterRecord } from "../seed/starter-record";
import { createRecipeSchema } from "../services/recipe.service";

const records = seedRecipes.map(starterRecord);
const key = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("vi");
const CONDITIONS = ["Tiểu đường", "Cao huyết áp", "Gout", "Mỡ máu cao"];
const SEAFOOD_KINDS = ["tôm", "cua", "mực"];

test("starter records are valid admin API bodies", () => {
  for (const record of records) {
    const parsed = createRecipeSchema.safeParse(record);
    assert.equal(parsed.success, true, `${record.name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`);
  }
});

test("macros add up to the calories within 5% (4/4/9 kcal per gram; 5 kcal slack for drinks like tea)", () => {
  for (const recipe of seedRecipes) {
    const fromMacros = recipe.protein * 4 + recipe.carbs * 4 + recipe.fat * 9;
    assert.ok(Math.abs(fromMacros - recipe.calories) <= Math.max(recipe.calories * 0.05, 5), `${recipe.name}: ${fromMacros} vs ${recipe.calories}`);
  }
});

test("allergen tags cover every allergen the ingredients (seasonings included) contain", () => {
  for (const record of records) {
    const stored = new Set(record.allergens.map(key));
    const needed = healthTagsFor({ name: record.name, role: record.role, ingredientNames: record.ingredientDetails.map((detail) => detail.name) }).allergens;
    for (const tag of needed.map(key)) {
      // "Tôm" / "Cua" / "Mực" are covered by the broader "hải sản" tag the older starter dishes use.
      const covered = stored.has(tag) || (SEAFOOD_KINDS.includes(tag) && stored.has("hải sản"));
      assert.ok(covered, `${record.name}: missing allergen ${tag} (has ${record.allergens.join(", ") || "none"})`);
    }
  }
});

test("contraindications use the nutrition-service catalog spelling", () => {
  for (const record of records) record.contraindications.forEach((name) => assert.ok(CONDITIONS.includes(name), `${record.name}: ${name}`));
});

test("steps use only listed ingredients, and every main ingredient is used in a step", () => {
  for (const recipe of seedRecipes) {
    const record = starterRecord(recipe);
    const listed = new Set(record.ingredientDetails.map((detail) => detail.name));
    const used = new Set((record.steps ?? []).flatMap((step) => step.ingredients.map((ingredient) => ingredient.name)));
    used.forEach((name) => assert.ok(listed.has(name), `${recipe.name}: step uses unlisted ${name}`));
    recipe.ingredients.forEach((ingredient) => assert.ok(used.has(ingredient.name), `${recipe.name}: ${ingredient.name} is never used in a step`));
    (record.steps ?? []).forEach((step) => assert.ok(step.durationSeconds === null || (step.durationSeconds > 0 && step.durationSeconds <= 7200), `${recipe.name}: ${step.instruction}`));
  }
});

test("thin roles have at least 4 options for their meals", () => {
  const count = (role: string, meal: string) => seedRecipes.filter((recipe) => starterRecord(recipe).role === role && recipe.mealTypes.includes(meal as "lunch")).length;
  assert.ok(count("rau", "lunch") >= 4 && count("rau", "dinner") >= 4);
  assert.ok(count("do_uong", "breakfast") >= 4);
  assert.ok(count("mot_mon", "breakfast") >= 4);
});

test("seed is idempotent: an older database gets only the new dishes, a full one gets nothing", async () => {
  const fake = (names: string[]) => {
    const created: string[] = [];
    const client = {
      recipe: {
        findMany: async () => names.map((name) => ({ name })),
        createMany: async ({ data }: { data: Array<{ name: string }> }) => { created.push(...data.map((row) => row.name)); names.push(...data.map((row) => row.name)); return { count: data.length }; },
      },
      deletedStarterRecipe: { findMany: async () => [] },
    } as unknown as PrismaClient;
    return { client, created };
  };
  const older = fake(seedRecipes.slice(0, 48).map((recipe) => recipe.name));
  assert.equal(await seedMissingRecipes(older.client), seedRecipes.length - 48);
  assert.ok(older.created.includes("Bánh cuốn") && older.created.includes("Su su luộc"));
  assert.equal(await seedMissingRecipes(older.client), 0);
});
