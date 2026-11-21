import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { createApp } from "../app";
import { seedRecipes } from "../seed/recipes.data";
import { seedMissingRecipes, seedRecipesIfEmpty } from "../seed/seed-recipes";
import { createRecipeSchema, ingredientDetailSchema } from "../services/recipe.service";

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const post = (url: string, role?: string) => fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", ...(role ? { "x-user-role": role } : {}) },
  body: JSON.stringify({ name: "" }),
});

test("write routes keep the admin guard on every mount (gateway-stripped root, /api/recipes, /api/recipe)", async () => {
  await withServer(async (baseUrl) => {
    for (const path of ["/", "/api/recipes", "/api/recipe"]) {
      assert.equal((await post(`${baseUrl}${path}`)).status, 401, `${path} without a role`);
      assert.equal((await post(`${baseUrl}${path}`, "USER")).status, 403, `${path} as USER`);
      // ADMIN reaches the controller: the invalid body is rejected by validation (no database needed).
      assert.equal((await post(`${baseUrl}${path}`, "ADMIN")).status, 400, `${path} as ADMIN`);
    }
    const put = await fetch(`${baseUrl}/some-id`, { method: "PUT", headers: { "x-user-role": "USER" } });
    assert.equal(put.status, 403);
    const del = await fetch(`${baseUrl}/some-id`, { method: "DELETE" });
    assert.equal(del.status, 401);
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  });
});

test("structured ingredients fill the plain names when they are not sent", () => {
  const parsed = createRecipeSchema.parse({ name: "Trứng xào cà chua", ingredientDetails: [{ name: "Trứng gà", quantity: 4, unit: "PIECE" }, { name: "Cà chua" }] });
  assert.deepEqual(parsed.ingredients, ["Trứng gà", "Cà chua"]);
  assert.equal(createRecipeSchema.safeParse({ name: "Không nguyên liệu" }).success, false);
  assert.equal(createRecipeSchema.safeParse({ name: "Sai đơn vị", ingredientDetails: [{ name: "Gạo", quantity: 1, unit: "cup" }] }).success, false);
});

test("starter catalog: 20-30 unique Vietnamese dishes with valid ingredients, meals and nutrition", () => {
  assert.ok(seedRecipes.length >= 20 && seedRecipes.length <= 30);
  assert.equal(new Set(seedRecipes.map((recipe) => recipe.name)).size, seedRecipes.length);
  for (const meal of ["breakfast", "lunch", "dinner"] as const) {
    assert.ok(seedRecipes.filter((recipe) => recipe.mealTypes.includes(meal)).length >= 5, meal);
  }
  for (const recipe of seedRecipes) {
    assert.ok(recipe.ingredients.length >= 2, recipe.name);
    recipe.ingredients.forEach((ingredient) => assert.equal(ingredientDetailSchema.safeParse(ingredient).success, true, `${recipe.name}: ${ingredient.name}`));
    assert.ok(recipe.calories > 50 && recipe.calories < 900, recipe.name);
    // Macros roughly add up to the calories (4/4/9 kcal per gram).
    const fromMacros = recipe.protein * 4 + recipe.carbs * 4 + recipe.fat * 9;
    assert.ok(Math.abs(fromMacros - recipe.calories) / recipe.calories < 0.25, `${recipe.name}: ${fromMacros} vs ${recipe.calories}`);
  }
});

function fakeClient(names: string[]) {
  const created: Array<{ name: string }> = [];
  const client = {
    recipe: {
      count: async () => names.length,
      findMany: async () => names.map((name) => ({ name })),
      createMany: async ({ data }: { data: Array<{ name: string }> }) => { created.push(...data); return { count: data.length }; },
    },
  } as unknown as PrismaClient;
  return { client, created };
}

test("seed adds only missing names, never touches existing rows, and runs at start only on an empty table", async () => {
  const fresh = fakeClient([]);
  assert.equal(await seedRecipesIfEmpty(fresh.client), seedRecipes.length);

  const existing = fakeClient(["phở bò", "Một món admin tự thêm"]);
  assert.equal(await seedRecipesIfEmpty(existing.client), 0);
  assert.equal(existing.created.length, 0);

  assert.equal(await seedMissingRecipes(existing.client), seedRecipes.length - 1);
  assert.ok(!existing.created.some((row) => row.name === "Phở bò"));
});
