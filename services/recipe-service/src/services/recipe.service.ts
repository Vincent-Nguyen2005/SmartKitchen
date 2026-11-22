import { Prisma, type PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { imageUrlProblem, MAX_IMAGE_URL_LENGTH } from "../lib/image-url";

const recipeUnits = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const;
const nutrient = z.number().finite().nonnegative().max(10_000).nullable().optional();
const tagList = z.array(z.string().trim().min(1).max(60)).max(30);

export const ingredientDetailSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().finite().positive().max(100_000).nullable().optional(),
  unit: z.enum(recipeUnits).nullable().optional(),
  /** Free-text amount when there is no number, e.g. "vừa ăn", "1 muỗng cà phê". */
  note: z.string().trim().min(1).max(40).nullable().optional(),
  /** Pantry staple (muối, nước mắm, dầu ăn...): shown under "Gia vị", never counted against Kho. */
  isSeasoning: z.boolean().optional(),
  /**
   * Eaten one per person (bánh mì, trứng ốp la, a glass of milk / orange juice): menus scale it per person, rounding
   * each person's amount up first. Unset = normal ingredient (scaled with the recipe's servings).
   */
  perPerson: z.boolean().optional(),
});

/** Dish roles in a Vietnamese family meal (menu-service composes lunch/dinner from them). */
export const RECIPE_ROLES = ["man", "xao", "canh", "rau", "trang_mieng", "sang", "mot_mon", "do_uong"] as const;
export const MAX_STEPS = 30;
export const MAX_STEP_SECONDS = 7200;

export const recipeStepSchema = z.object({
  /** Position (1-based); steps are sorted by it and renumbered 1..n on save. */
  order: z.number().int().min(1).max(1000).optional(),
  instruction: z.string().trim().min(1).max(500),
  /** Timer for this step; null = "do it, then go to the next step". */
  durationSeconds: z.number().int().min(0).max(MAX_STEP_SECONDS).nullable().optional(),
  /** Ingredients added in this step (names from the dish, optional quantity/unit). */
  ingredients: z.array(ingredientDetailSchema).max(30).default([]),
});

/** Sorted by `order` (then position), renumbered 1..n, duration null when missing. */
const normalizeSteps = (steps: Array<z.infer<typeof recipeStepSchema>>) =>
  steps
    .map((step, index) => ({ step, index }))
    .sort((left, right) => (left.step.order ?? left.index + 1) - (right.step.order ?? right.index + 1) || left.index - right.index)
    .map(({ step }, index) => ({ order: index + 1, instruction: step.instruction, durationSeconds: step.durationSeconds ?? null, ingredients: step.ingredients }));

const recipeFields = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  /** Structured ingredients (name, quantity, unit), used by menu-service to match Kho. */
  ingredientDetails: z.array(ingredientDetailSchema).max(100).nullable().optional(),
  mealTypes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  dietaryTags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  preparationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  servings: z.number().int().positive().max(100).nullable().optional(),
  /** Pasted https link to a public image; stored as text only, never fetched by the server. */
  imageUrl: z.string().trim().max(MAX_IMAGE_URL_LENGTH).superRefine((value, context) => {
    const problem = imageUrlProblem(value);
    if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }).nullable().optional(),
  /** Per serving. */
  calories: nutrient,
  protein: nutrient,
  carbs: nutrient,
  fat: nutrient,
  allergens: tagList.optional(),
  contraindications: tagList.optional(),
  isActive: z.boolean().optional(),
  role: z.enum(RECIPE_ROLES).nullable().optional(),
  /** Cooking steps (at most 30, each timer 0-7200 s); null clears them. */
  steps: z.array(recipeStepSchema).max(MAX_STEPS).transform(normalizeSteps).nullable().optional(),
});

/** Plain names stay filled for older readers: taken from ingredientDetails when not sent. */
const withIngredientNames = <T extends { ingredients?: string[]; ingredientDetails?: Array<{ name: string }> | null }>(input: T): T =>
  input.ingredients === undefined && input.ingredientDetails
    ? { ...input, ingredients: input.ingredientDetails.map((detail) => detail.name) }
    : input;

export const createRecipeSchema = recipeFields
  .refine((input) => input.ingredients !== undefined || input.ingredientDetails != null, "ingredients or ingredientDetails is required")
  .transform((input) => ({ ...withIngredientNames(input), ingredients: withIngredientNames(input).ingredients ?? [] }));

export const updateRecipeSchema = recipeFields.partial().refine(
  (input) => Object.keys(input).length > 0,
  "At least one field must be provided",
).transform(withIngredientNames);

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

/** Prisma needs DbNull (not null) to clear a Json column. */
const toPrismaData = <T extends { ingredientDetails?: unknown; steps?: unknown }>(data: T) => ({
  ...data,
  ...(data.ingredientDetails === null ? { ingredientDetails: Prisma.DbNull } : {}),
  ...(data.steps === null ? { steps: Prisma.DbNull } : {}),
});

export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found");
    this.name = "RecipeNotFoundError";
  }
}

export async function listRecipes(
  query: { search?: string; mealType?: string; active?: boolean } = {},
  client: PrismaClient = prisma,
) {
  const search = query.search?.trim();
  return client.recipe.findMany({
    where: {
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(query.mealType ? { mealTypes: { has: query.mealType } } : {}),
      ...(query.active ? { isActive: true } : {}),
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
  return client.recipe.create({ data: toPrismaData(data) as Prisma.RecipeCreateInput });
}

export async function updateRecipe(id: string, input: unknown, client: PrismaClient = prisma) {
  const data = updateRecipeSchema.parse(input);
  const result = await client.recipe.updateMany({
    where: { id },
    data: toPrismaData(data) as Prisma.RecipeUpdateManyMutationInput,
  });
  if (result.count === 0) throw new RecipeNotFoundError();
  return getRecipe(id, client);
}

export async function deleteRecipe(id: string, client: PrismaClient = prisma): Promise<void> {
  const result = await client.recipe.deleteMany({ where: { id } });
  if (result.count === 0) throw new RecipeNotFoundError();
}
