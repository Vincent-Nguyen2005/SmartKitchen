import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { seedRecipes } from "../seed/recipes.data";
import { stepsFor } from "../seed/recipe-steps.data";
import { seasoningsFor } from "../seed/seasonings.data";
import { fillSeasonings } from "../seed/seed-recipes";
import { createRecipeSchema } from "../services/recipe.service";

const recipe = (name: string) => seedRecipes.find((entry) => entry.name === name)!;

test("ingredients accept isSeasoning and a free-text amount such as 'vừa ăn'", () => {
  const parsed = createRecipeSchema.parse({
    name: "Canh rau",
    ingredientDetails: [{ name: "Rau ngót", quantity: 300, unit: "GRAM" }, { name: "Muối", quantity: null, note: "vừa ăn", isSeasoning: true }],
  });
  assert.deepEqual(parsed.ingredientDetails?.[1], { name: "Muối", quantity: null, note: "vừa ăn", isSeasoning: true });
  assert.equal(createRecipeSchema.safeParse({ name: "X", ingredientDetails: [{ name: "Muối", note: "a".repeat(41) }] }).success, false);
});

test("every savoury starter dish gets seasonings; desserts and fruit get none; no duplicates of listed ingredients", () => {
  for (const seed of seedRecipes) {
    const lines = seasoningsFor(seed);
    assert.ok(lines.every((entry) => entry.isSeasoning && entry.quantity === null && entry.note), seed.name);
    const names = seed.ingredients.map((ingredient) => ingredient.name.toLocaleLowerCase("vi"));
    assert.ok(lines.every((entry) => !names.includes(entry.name.toLocaleLowerCase("vi"))), seed.name);
  }
  assert.ok(seasoningsFor(recipe("Thịt kho trứng")).some((entry) => entry.name === "Nước mắm"));
  assert.deepEqual(seasoningsFor(recipe("Dưa hấu")), []);
  // "Rau muống xào tỏi" already lists Tỏi: not added again.
  assert.ok(!seasoningsFor(recipe("Rau muống xào tỏi")).some((entry) => entry.name === "Tỏi"));
});

type Row = { id: string; name: string; ingredientDetails: unknown; steps: unknown };

function fakeClient(rows: Row[]) {
  const client = {
    recipe: {
      findMany: async () => rows.map((row) => ({ ...row })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as PrismaClient;
  return client;
}

test("data step: adds only missing seasoning lines, keeps existing ingredients, updates only unedited 'nêm' steps, idempotent", async () => {
  const canh = recipe("Canh rau ngót thịt bằm");
  const canhSteps = stepsFor(canh)!;
  const edited = recipe("Canh bí đỏ thịt bằm");
  const editedSteps = [{ order: 1, instruction: "Bước admin tự viết, nêm theo ý", durationSeconds: null, ingredients: [] }];
  const rows: Row[] = [
    // JSONB may return keys in another order: still recognised as unedited.
    { id: "1", name: canh.name, ingredientDetails: canh.ingredients, steps: canhSteps.map((step) => ({ ingredients: step.ingredients, durationSeconds: step.durationSeconds, instruction: step.instruction, order: step.order })) },
    { id: "2", name: edited.name, ingredientDetails: edited.ingredients, steps: editedSteps },
    { id: "3", name: "Món admin", ingredientDetails: [{ name: "Gạo" }], steps: null },
  ];
  const client = fakeClient(rows);

  assert.equal(await fillSeasonings(client), 2);
  const canhDetails = rows[0].ingredientDetails as Array<{ name: string; isSeasoning?: boolean }>;
  assert.deepEqual(canhDetails.slice(0, canh.ingredients.length), canh.ingredients);
  assert.ok(canhDetails.some((entry) => entry.name === "Nước mắm" && entry.isSeasoning));
  const nemStep = (rows[0].steps as Array<{ instruction: string; ingredients: Array<{ name: string }> }>).find((step) => /nêm/i.test(step.instruction))!;
  assert.match(nemStep.instruction, /\(.*nước mắm.*\)$/);
  assert.ok(nemStep.ingredients.some((entry) => entry.name === "Nước mắm"));
  // Admin-edited steps are left alone (ingredients still get the seasoning lines).
  assert.deepEqual(rows[1].steps, editedSteps);
  assert.ok((rows[1].ingredientDetails as Array<{ isSeasoning?: boolean }>).some((entry) => entry.isSeasoning));
  // Not a starter dish: untouched.
  assert.deepEqual(rows[2].ingredientDetails, [{ name: "Gạo" }]);

  const snapshot = JSON.stringify(rows);
  assert.equal(await fillSeasonings(client), 0);
  assert.equal(JSON.stringify(rows), snapshot);
});
