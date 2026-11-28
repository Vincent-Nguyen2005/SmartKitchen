import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { seedRecipes, seedRole } from "../seed/recipes.data";
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

test("starter steps: every seeded dish has 4-6 steps (2-6 for desserts and drinks) whose ingredients belong to the dish", () => {
  assert.equal(dishesWithSteps().length, seedRecipes.length);
  for (const recipe of seedRecipes) {
    const rows = stepRowsFor(recipe.name) ?? [];
    const light = seedRole(recipe) === "trang_mieng" || seedRole(recipe) === "do_uong";
    assert.ok(rows.length >= (light ? 2 : 4) && rows.length <= 6, recipe.name);
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

test("roles: validated on input; every starter dish has one; enough variety per meal and role", async () => {
  const { fillMissingRoles } = await import("../seed/seed-recipes");
  assert.equal(createRecipeSchema.safeParse({ ...base, role: "canh" }).success, true);
  assert.equal(createRecipeSchema.safeParse({ ...base, role: null }).success, true);
  assert.equal(createRecipeSchema.safeParse({ ...base, role: "soup" }).success, false);
  for (const recipe of seedRecipes) assert.ok(seedRole(recipe), recipe.name);
  const breakfast = seedRecipes.filter((recipe) => recipe.mealTypes.includes("breakfast"));
  const mains = seedRecipes.filter((recipe) => (recipe.mealTypes.includes("lunch") || recipe.mealTypes.includes("dinner")) && !["trang_mieng", "do_uong"].includes(seedRole(recipe) ?? ""));
  assert.ok(breakfast.length >= 12, `breakfast ${breakfast.length}`);
  assert.ok(mains.length >= 20, `lunch/dinner mains ${mains.length}`);
  for (const role of ["man", "xao", "canh", "rau", "trang_mieng"]) {
    assert.ok(seedRecipes.filter((recipe) => seedRole(recipe) === role).length >= 3, role);
  }
  assert.ok(breakfast.some((recipe) => seedRole(recipe) === "do_uong"));

  // Data migration: fills only empty roles of starter dishes, never overwrites, idempotent.
  const rows = [
    { id: "1", name: "Phở bò", role: null as string | null },
    { id: "2", name: "Cá kho tộ", role: "canh" as string | null },
    { id: "3", name: "Món admin", role: null as string | null },
  ];
  const client = {
    recipe: {
      findMany: async () => rows.filter((row) => row.role === null).map(({ id, name }) => ({ id, name })),
      updateMany: async ({ where, data }: { where: { id: string }; data: { role: string } }) => {
        const row = rows.find((entry) => entry.id === where.id && entry.role === null);
        if (!row) return { count: 0 };
        row.role = data.role;
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  assert.equal(await fillMissingRoles(client), 1);
  assert.deepEqual(rows.map((row) => row.role), ["mot_mon", "canh", null]);
  assert.equal(await fillMissingRoles(client), 0);
});

test("khai vị: appetizers / rolls are a side role (never a rice meal's main) and the API accepts it", () => {
  const byName = (name: string) => seedRecipes.find((recipe) => recipe.name === name)!;
  assert.equal(seedRole(byName("Gỏi cuốn tôm thịt")), "khai_vi");
  assert.equal(seedRole(byName("Trứng cuộn kiểu Hàn")), "khai_vi");
  assert.equal(createRecipeSchema.safeParse({ name: "Chả giò", ingredients: ["Thịt heo"], role: "khai_vi" }).success, true);
  assert.equal(createRecipeSchema.safeParse({ name: "Chả giò", ingredients: ["Thịt heo"], role: "appetizer" }).success, false);
});

test("2026-12 món mặn additions: realistic rice-meal mains (lunch / dinner, 4 servings, 4–7 steps, seasonings flagged)", () => {
  const names = ["Cá basa kho tiêu", "Gà chiên nước mắm", "Bò xào hành tây", "Mực xào chua ngọt", "Tôm rang thịt", "Thịt rang cháy cạnh", "Cá thu sốt cà chua", "Trứng chiên thịt"];
  for (const name of names) {
    const recipe = seedRecipes.find((entry) => entry.name === name);
    assert.ok(recipe, name);
    assert.equal(seedRole(recipe), "man", name);
    assert.equal(recipe.cuisine ?? "vietnam", "vietnam", name);
    assert.deepEqual([...recipe.mealTypes].sort(), ["dinner", "lunch"], name);
    assert.equal(recipe.servings, 4, name);
    const steps = stepsFor(recipe) ?? [];
    assert.ok(steps.length >= 4 && steps.length <= 7, `${name}: ${steps.length} steps`);
  }
});
