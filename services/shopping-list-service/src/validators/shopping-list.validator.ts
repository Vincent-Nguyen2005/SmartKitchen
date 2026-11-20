import { z } from "zod";

export const familyQuerySchema = z.object({
  familyId: z.string().uuid(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateItemBodySchema = z
  .object({
    quantity: z.number().positive().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;

export const addItemBodySchema = z.object({
  familyId: z.string().uuid(),
  shoppingListId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().finite().positive().max(1_000_000).default(1),
  unit: z.enum(["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"]).default("PIECE"),
  note: z.string().trim().max(500).nullable().optional(),
  // Price snapshot from the market (Đi chợ / Khuyến mãi); all optional.
  unitPrice: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  discountPercent: z.number().int().min(1).max(100).nullable().optional(),
  productId: z.string().trim().min(1).max(64).nullable().optional(),
  imageUrl: z.string().trim().url().max(2048).nullable().optional(),
});

/** "Mua" in Giỏ hàng. `items` only adds catalog details per cart line (group, shelf-life days for the expiry). */
export const checkoutBodySchema = z.object({
  familyId: z.string().uuid(),
  items: z.array(z.object({
    id: z.string().uuid(),
    categoryName: z.string().trim().min(1).max(50).optional(),
    shelfLifeDays: z.number().int().min(0).max(3650).optional(),
  })).max(200).default([]),
});

export const generateBodySchema = z.object({ familyId: z.string().uuid() });
