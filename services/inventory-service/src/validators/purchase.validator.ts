import { z } from "zod";

export const applyPurchaseSchema = z.object({
  externalPurchaseId: z.string().uuid(),
  familyId: z.string().uuid(),
  createdByUserId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.enum(["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"]),
  /** Admin catalog product id (Đi chợ); stored on the item so the app can show the product image. */
  productId: z.string().trim().min(1).max(64).optional(),
  /** Optional group from the market catalog ("Nhóm"); the category is created on first use. */
  categoryName: z.string().trim().min(1).max(50).optional(),
  /** Optional expiry day, YYYY-MM-DD (today + catalog shelf-life days, computed by the caller). */
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => {
    const date = new Date(`${day}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }, "Use a real date in YYYY-MM-DD format.").optional(),
});

export type ApplyPurchaseInput = z.infer<typeof applyPurchaseSchema>;

export const barcodeParamSchema = z.object({ barcode: z.string().regex(/^\d{8,14}$/) });

export const receiptOcrSchema = z.object({
  imageBase64: z.string().min(1).max(8_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
