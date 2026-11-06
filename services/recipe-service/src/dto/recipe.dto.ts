import { z } from "zod";

export const recipeResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  ingredients: z.array(z.string()),
  allergens: z.array(z.string()),
  contraindications: z.array(z.string()),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  isActive: z.boolean(),
});

export type RecipeDto = z.infer<typeof recipeResponseSchema>;
