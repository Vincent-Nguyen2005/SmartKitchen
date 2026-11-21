import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { seedRecipes } from "../seed/recipes.data";
import { dishesWithSteps, stepRowsFor, stepsFor } from "../seed/recipe-steps.data";
import { fillMissingSteps } from "../seed/seed-recipes";
import { createRecipeSchema, MAX_STEP_SECONDS, MAX_STEPS, updateRecipeSchema } from "../services/recipe.service";

const base = { name: "Rau muống xào tỏi", ingredients: ["Rau muống", "Tỏi"] };

test("steps: sorted by order, renumbered 1..n, duration null when missing, ingredients with quantity/unit", () => {
  const parsed = createRecipeSchema.parse({
    ...base,
    steps: [
      { order: 5, instruction: "Cho rau muống vào xào", durationSeconds: 120, ingredients: [{ name: "Rau muống", quantity: 500, unit: "GRAM" }] },
      { order: 2, instruction: "Phi thơm tỏi", durationSeconds: 60, ingredients: [{ name: "Tỏi" }] },
      { instruction: "Nêm vừa ăn" },
    ],
  });
  assert.deepEqual(parsed.steps?.map((step) => [step.order, step.instruction, step.durationSeconds]), [
    [1, "Phi thơm tỏi", 60],
    [2, "Nêm vừa ăn", null],
    [3, "Cho rau muống vào xào", 120],
  ]);
  assert.deepEqual(parsed.steps?.[2].ingredients, [{ name: "Rau muống", quantity: 500, unit: "GRAM" }]);
  assert.equal(updateRecipeSchema.safeParse({ steps: null }).success, true);
});

test("steps validation: durations 0-7200 s, at most 30 steps, instruction required", () => {
  const step = (durationSeconds: number | null) => ({ instruction: "Bước", durationSeconds });
  assert.equal(createRecipeSchema.safeParse({ ...base, steps: [step(0), step(MAX_STEP_SECONDS), step(null)] }).success, true);
  assert.equal(createRecipeSchema.safeParse({ ...base, steps: [step(-1)] }).success, false);
  assert.equal(createRecipeSchema.safeParse({ ...base, steps: [step(MAX_STEP_SECONDS + 1)] }).success, false);
  assert.equal(createRecipeSchema.safeParse({ ...base, steps: [step(1.5)] }).success, false);
  assert.equal(createRecipeSchema.safeParse({ ...base, steps: Array.from({ length: MAX_STEPS }, () => step(60)) }).success, true);
  assert.equal(updateRecipeSchema.safeParse({ steps: Array.from({ length: MAX_STEPS + 1 }, () => step(60)) }).success, false);
  assert.equal(updateRecipeSchema.safeParse({ steps: [{ instruction: " ", durationSeconds: 60 }] }).success, false);
});

test("starter steps: every seeded dish has 4-6 steps whose ingredients belong to the dish and pass validation", () => {
  assert.equal(dishesWithSteps().length, seedRecipes.length);
  for (const recipe of seedRecipes) {
    const rows = stepRowsFor(recipe.name) ?? [];
    assert.ok(rows.length >= 4 && rows.length <= 6, recipe.name);
    const names = new Set(recipe.ingredients.map((ingredient) => ingredient.name));
    for (const [, , used] of rows) used.forEach((name) => assert.ok(names.has(name), `${recipe.name}: ${name}`));
    const parsed = updateRecipeSchema.safeParse({ steps: stepsFor(recipe) });
    assert.equal(parsed.success, true, recipe.name);
  }
});

function fakeClient(rows: Array<{ id: string; name: string; steps: unknown }>) {
  const updates: string[] = [];
  const client = {
    recipe: {
      findMany: async () => rows.filter((row) => row.steps === null).map(({ id, name }) => ({ id, name })),
      updateMany: async ({ where, data }: { where: { id: string }; data: { steps: unknown } }) => {
        const row = rows.find((entry) => entry.id === where.id && entry.steps === null);
        if (!row) return { count: 0 };
        row.steps = data.steps;
        updates.push(row.name);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  return { client, updates };
}

test("data migration fills only starter dishes without steps, never overwrites, and is idempotent", async () => {
  const adminSteps = [{ order: 1, instruction: "Bước của admin", durationSeconds: null, ingredients: [] }];
  const rows = [
    { id: "1", name: "Phở bò", steps: null },
    { id: "2", name: "rau muống xào tỏi", steps: null },
    { id: "3", name: "Cá kho tộ", steps: adminSteps },
    { id: "4", name: "Món admin tự thêm", steps: null },
  ];
  const { client, updates } = fakeClient(rows);
  assert.equal(await fillMissingSteps(client), 2);
  assert.deepEqual(updates, ["Phở bò", "rau muống xào tỏi"]);
  assert.equal(rows[2].steps, adminSteps);
  assert.equal(rows[3].steps, null);
  assert.equal(await fillMissingSteps(client), 0);
});
