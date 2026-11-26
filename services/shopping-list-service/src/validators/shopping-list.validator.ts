import { z } from "zod";
import { quantityProblem } from "../lib/quantity-rule";

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

const addItemFields = z.object({
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

/** kg in 0.1 steps (max 20), catalog count units in whole numbers (lib/quantity-rule). */
const checkQuantity = (item: { quantity: number; unit: string; productId?: string | null }, context: z.RefinementCtx) => {
  const problem = quantityProblem(item.quantity, item.unit, Boolean(item.productId));
  if (problem) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: problem });
};

export const addItemBodySchema = addItemFields.superRefine(checkQuantity);

/** POST /items/ensure: "Thêm vào Giỏ hàng" from "Cần mua tuần này" (at least these quantities, idempotent). */
export const ensureItemsBodySchema = z.object({
  familyId: z.string().uuid(),
  items: z.array(addItemFields.omit({ familyId: true, shoppingListId: true, note: true }).superRefine(checkQuantity)).min(1).max(100),
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

/** GET /spending ("Chi tiêu"): a Vietnam month (default: the current one) of the family's purchases. */
export const spendingQuerySchema = z.object({
  familyId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM").optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
