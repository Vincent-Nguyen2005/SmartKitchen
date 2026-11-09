import type { Prisma, PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { z } from "zod";
import { prisma } from "../lib/prisma";

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(100),
  mealTypes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  dietaryTags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  preparationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  servings: z.number().int().positive().max(100).nullable().optional(),
});

export const updateRecipeSchema = createRecipeSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one field must be provided",
);

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found");
    this.name = "RecipeNotFoundError";
  }
}

export async function listRecipes(
  query: { search?: string; mealType?: string } = {},
  client: PrismaClient = prisma,
) {
  const search = query.search?.trim();
  return client.recipe.findMany({
    where: {
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(query.mealType ? { mealTypes: { has: query.mealType } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getRecipe(id: string, client: PrismaClient = prisma) {
  const recipe = await client.recipe.findUnique({ where: { id } });
  if (!recipe) throw new RecipeNotFoundError();
  return recipe;
}

export function createRecipe(input: unknown, client: PrismaClient = prisma) {
  const data = createRecipeSchema.parse(input);
  return client.recipe.create({ data });
}

export async function updateRecipe(id: string, input: unknown, client: PrismaClient = prisma) {
  const data = updateRecipeSchema.parse(input);
  const result = await client.recipe.updateMany({
    where: { id },
    data: data as Prisma.RecipeUpdateManyMutationInput,
  });
  if (result.count === 0) throw new RecipeNotFoundError();
  return getRecipe(id, client);
}

export async function deleteRecipe(id: string, client: PrismaClient = prisma): Promise<void> {
  const result = await client.recipe.deleteMany({ where: { id } });
  if (result.count === 0) throw new RecipeNotFoundError();
}
