import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import {
  createRecipe,
  createRecipeSchema,
  deleteRecipe,
  getRecipe,
  listRecipes,
  RecipeInUseError,
  RecipeNotFoundError,
  updateRecipe,
} from "../services/recipe.service";
import { createMenuUsageCheck, RecipeUsageUnavailableError } from "../lib/menu-usage";

const validRecipe = {
  name: "Vegetable rice",
  ingredients: ["rice", "spinach"],
  mealTypes: ["lunch"],
  dietaryTags: ["vegetarian"],
  tags: ["quick"],
  preparationMinutes: 25,
  servings: 2,
};

test("recipe input validation rejects empty names, invalid ingredients and invalid timing", () => {
  assert.equal(createRecipeSchema.safeParse(validRecipe).success, true);
  assert.equal(createRecipeSchema.safeParse({ ...validRecipe, name: " " }).success, false);
  assert.equal(createRecipeSchema.safeParse({ ...validRecipe, ingredients: [""] }).success, false);
  assert.equal(createRecipeSchema.safeParse({ ...validRecipe, preparationMinutes: -1 }).success, false);
});

test("createRecipe validates input and persists the normalized data", async () => {
  let createArgs: unknown;
  const client = {
    recipe: {
      create: async (args: unknown) => {
        createArgs = args;
        return { id: "recipe-1", ...((args as { data: typeof validRecipe }).data) };
      },
    },
  } as unknown as PrismaClient;

  const result = await createRecipe({ ...validRecipe, name: "  Vegetable rice  " }, client);
  assert.equal(result.name, "Vegetable rice");
  assert.deepEqual(createArgs, { data: { ...validRecipe, name: "Vegetable rice" } });
});

test("listRecipes applies search and meal type filters", async () => {
  let findArgs: unknown;
  const client = {
    recipe: {
      findMany: async (args: unknown) => {
        findArgs = args;
        return [{ id: "recipe-1", name: "Vegetable rice" }];
      },
    },
  } as unknown as PrismaClient;

  const result = await listRecipes({ search: " rice ", mealType: "lunch" }, client);
  assert.equal(result.length, 1);
  assert.deepEqual(findArgs, {
    where: {
      name: { contains: "rice", mode: "insensitive" },
      mealTypes: { has: "lunch" },
    },
    orderBy: { name: "asc" },
  });
});

test("get, update and delete report missing recipes and update existing ones", async () => {
  let stored = { id: "recipe-1", ...validRecipe };
  const client = {
    recipe: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === stored.id ? stored : null,
      updateMany: async ({ where, data }: { where: { id: string }; data: Partial<typeof validRecipe> }) => {
        if (where.id !== stored.id) return { count: 0 };
        stored = { ...stored, ...data };
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string } }) => where.id === stored.id ? { count: 1 } : { count: 0 },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(client),
  } as unknown as PrismaClient;
  const unused = async () => ({ menuItems: 0, removedDishes: 0 });

  assert.equal((await getRecipe("recipe-1", client)).name, "Vegetable rice");
  assert.equal((await updateRecipe("recipe-1", { name: "Spinach rice" }, client)).name, "Spinach rice");
  await assert.rejects(getRecipe("missing", client), RecipeNotFoundError);
  await assert.rejects(updateRecipe("missing", { name: "Missing" }, client), RecipeNotFoundError);
  await deleteRecipe("recipe-1", client, unused);
  await assert.rejects(deleteRecipe("missing", client, unused), RecipeNotFoundError);
});

test("delete: refused (IN_USE) while menus or dislike history use the dish; unanswered check deletes nothing", async () => {
  const deleted: string[] = [];
  const tombstones: string[] = [];
  const rows = new Map([["r1", { id: "r1", name: "Phở bò" }], ["r2", { id: "r2", name: "Món admin tự thêm" }]]);
  const client = {
    recipe: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      deleteMany: async ({ where }: { where: { id: string } }) => { deleted.push(where.id); return { count: 1 }; },
    },
    deletedStarterRecipe: { upsert: async ({ create }: { create: { nameKey: string } }) => { tombstones.push(create.nameKey); return create; } },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(client),
  } as unknown as PrismaClient;

  await assert.rejects(deleteRecipe("r1", client, async () => ({ menuItems: 2, removedDishes: 1 })), (error: unknown) => {
    assert.ok(error instanceof RecipeInUseError);
    assert.deepEqual(error.reasons, ["có trong 2 món của thực đơn đã lưu", "có trong lịch sử món bị bỏ"]);
    return true;
  });
  await assert.rejects(deleteRecipe("r1", client, async () => { throw new RecipeUsageUnavailableError("down"); }), RecipeUsageUnavailableError);
  assert.deepEqual(deleted, []);

  // Not used: deleted; a starter dish leaves a tombstone, an admin-made dish does not.
  await deleteRecipe("r1", client, async () => ({ menuItems: 0, removedDishes: 0 }));
  await deleteRecipe("r2", client, async () => ({ menuItems: 0, removedDishes: 0 }));
  assert.deepEqual(deleted, ["r1", "r2"]);
  assert.deepEqual(tombstones, ["phở bò"]);
});

test("menu usage check asks menu-service with the internal key and never guesses", async () => {
  const urls: string[] = [];
  const check = createMenuUsageCheck({ baseUrl: "menu-service:4007", apiKey: "k", fetchImpl: async (url, init) => {
    urls.push(`${url} ${init.headers["x-api-key"]}`);
    return { ok: true, status: 200, json: async () => ({ menuItems: 1, removedDishes: 0 }) };
  } });
  assert.deepEqual(await check("r1"), { menuItems: 1, removedDishes: 0 });
  assert.deepEqual(urls, ["http://menu-service:4007/internal/recipes/r1/usage k"]);
  const down = createMenuUsageCheck({ baseUrl: "http://m", apiKey: "k", fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }) });
  await assert.rejects(down("r1"), RecipeUsageUnavailableError);
  await assert.rejects(createMenuUsageCheck({ baseUrl: "http://m", apiKey: undefined })("r1"), RecipeUsageUnavailableError);
});
