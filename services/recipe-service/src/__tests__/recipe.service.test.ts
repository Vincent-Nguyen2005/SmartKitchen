import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import {
  createRecipe,
  createRecipeSchema,
  deleteRecipe,
  getRecipe,
  listRecipes,
  RecipeNotFoundError,
  updateRecipe,
} from "../services/recipe.service";

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
  } as unknown as PrismaClient;

  assert.equal((await getRecipe("recipe-1", client)).name, "Vegetable rice");
  assert.equal((await updateRecipe("recipe-1", { name: "Spinach rice" }, client)).name, "Spinach rice");
  await assert.rejects(getRecipe("missing", client), RecipeNotFoundError);
  await assert.rejects(updateRecipe("missing", { name: "Missing" }, client), RecipeNotFoundError);
  await deleteRecipe("recipe-1", client);
  await assert.rejects(deleteRecipe("missing", client), RecipeNotFoundError);
});
