import { z } from "zod";

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Use a real date in YYYY-MM-DD format.");

export const dailyStatsQuerySchema = z.object({ date: calendarDateSchema });

export const dailyMealSummarySchema = z.object({
  date: calendarDateSchema,
  totalCalories: z.number().finite().nonnegative(),
  totalProtein: z.number().finite().nonnegative(),
  totalCarbs: z.number().finite().nonnegative(),
  totalFat: z.number().finite().nonnegative(),
});

export const recipeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  ingredients: z.array(z.string()),
  allergens: z.array(z.string()),
  contraindications: z.array(z.string()),
  calories: z.number().finite().nonnegative(),
  protein: z.number().finite().nonnegative(),
  carbs: z.number().finite().nonnegative(),
  fat: z.number().finite().nonnegative(),
  isActive: z.boolean(),
});

export type RecipeDto = z.infer<typeof recipeSchema>;
