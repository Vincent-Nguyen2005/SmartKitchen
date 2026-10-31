import { z } from "zod";

export const familyQuerySchema = z.object({
  familyId: z.string().uuid(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateItemBodySchema = z
  .object({
    isPurchased: z.boolean().optional(),
    quantity: z.number().positive().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;
