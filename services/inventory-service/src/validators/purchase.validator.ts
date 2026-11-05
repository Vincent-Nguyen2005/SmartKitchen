import { z } from "zod";

export const applyPurchaseSchema = z.object({
  externalPurchaseId: z.string().uuid(),
  familyId: z.string().uuid(),
  createdByUserId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.enum(["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"]),
});

export type ApplyPurchaseInput = z.infer<typeof applyPurchaseSchema>;

export const barcodeParamSchema = z.object({ barcode: z.string().regex(/^\d{8,14}$/) });

export const receiptOcrSchema = z.object({
  imageBase64: z.string().min(1).max(8_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
