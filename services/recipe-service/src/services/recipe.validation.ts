import { z } from "zod";

const recipeIngredientSchema = z.object({
    name: z.string().trim().min(1).max(120),
    quantity: z.string().trim().min(1).max(80),
    unit: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(240).optional(),
});

const recipeStepSchema = z.object({
    instruction: z.string().trim().min(1).max(2000),
});

export const createRecipeSchema = z.object({
    title: z.string().trim().min(1).max(160),
    slug: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().min(1).max(4000),
    prepTimeMinutes: z.number().int().min(0).default(0),
    cookTimeMinutes: z.number().int().min(0).default(0),
    servings: z.number().int().min(1).max(100).default(1),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
    coverImageUrl: z.string().url().nullable().optional(),
    ingredients: z.array(recipeIngredientSchema).default([]),
    steps: z.array(recipeStepSchema).default([]),
    categories: z.array(z.string().trim().min(1).max(80)).default([]),
    tags: z.array(z.string().trim().min(1).max(80)).default([]),
});

export const updateRecipeSchema = createRecipeSchema.partial();

export const recipeListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(160).optional(),
    category: z.string().trim().min(1).optional(),
    tag: z.string().trim().min(1).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;