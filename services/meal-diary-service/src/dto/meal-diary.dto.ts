import { MealSource, MealType } from ".prisma/client-meal-diary";
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

export const mealHistoryQuerySchema = z.object({
  date: calendarDateSchema,
});

export const mealLogSchema = z.object({
  date: calendarDateSchema,
  mealType: z.nativeEnum(MealType),
  source: z.nativeEnum(MealSource),
  loggedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        foodName: z.string().trim().min(1).max(200),
        quantity: z.number().int().positive().max(10000).default(1),
        unit: z.string().trim().min(1).max(40).default("serving"),
        calories: z.number().finite().nonnegative(),
        protein: z.number().finite().nonnegative().nullable().optional(),
        carbs: z.number().finite().nonnegative().nullable().optional(),
        fat: z.number().finite().nonnegative().nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type MealLogInput = z.infer<typeof mealLogSchema>;
