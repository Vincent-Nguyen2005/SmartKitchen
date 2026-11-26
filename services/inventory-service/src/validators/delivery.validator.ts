import { z } from "zod";

const UNITS = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real date in YYYY-MM-DD format.");

const line = z.object({
  /** The shopping-list cart line id (the purchase id once delivered). */
  externalPurchaseId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.enum(UNITS),
  productId: z.string().trim().min(1).max(64).optional(),
  categoryName: z.string().trim().min(1).max(50).optional(),
  unitLabel: z.string().trim().min(1).max(16).optional(),
});

/** POST /internal/deliveries/pending: Kho rows "Đang giao" for a new order. */
export const deliveryLinesSchema = z.object({
  orderId: z.string().uuid(),
  familyId: z.string().uuid(),
  createdByUserId: z.string().uuid(),
  lines: z.array(line).min(1).max(200),
});
export type DeliveryLinesInput = z.infer<typeof deliveryLinesSchema>;

/** POST /internal/deliveries/:orderId/deliver: lines with expiry = delivery day + shelf life (computed by the caller). */
export const deliverSchema = z.object({
  familyId: z.string().uuid(),
  createdByUserId: z.string().uuid(),
  lines: z.array(line.extend({ expiryDate: day.optional() })).min(1).max(200),
});
export type DeliverInput = z.infer<typeof deliverSchema>;

export const cancelDeliverySchema = z.object({ familyId: z.string().uuid() });
export const orderIdParamSchema = z.object({ orderId: z.string().uuid() });
