import { z } from "zod";

const UnitEnum = z.enum([
  "GRAM",
  "KILOGRAM",
  "MILLILITER",
  "LITER",
  "PIECE",
  "PACK",
  "BOTTLE",
  "CAN",
  "BOX",
]);
const StorageLocationEnum = z.enum(["FRIDGE", "FREEZER", "PANTRY", "COUNTER"]);
const ItemStatusEnum = z.enum([
  "FRESH",
  "NEAR_EXPIRY",
  "EXPIRED",
  "CONSUMED",
  "DISCARDED",
]);

export const createItemSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  quantity: z.number().finite().min(0).default(0),
  unit: UnitEnum.default("PIECE"),
  minQuantity: z.number().finite().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  /** Free-text group ("Nhóm"), e.g. "Rau củ"; the matching category is created on first use. */
  categoryName: z.string().trim().min(1).max(50).optional(),
  storageLocation: StorageLocationEnum.default("FRIDGE"),
  expiryDate: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  imageUrl: z.string().url().optional(),
  barcode: z.string().trim().regex(/^\d{8,14}$/, "Barcode must contain 8 to 14 digits").optional(),
});

export const updateItemSchema = createItemSchema.omit({ familyId: true, expiryDate: true }).partial().extend({
  expiryDate: z.string().datetime().nullable().optional().transform((value) => value === undefined ? undefined : value === null ? null : new Date(value)),
  status: ItemStatusEnum.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const listItemsQuerySchema = z.object({
  familyId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  status: ItemStatusEnum.optional(),
  storageLocation: StorageLocationEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const catalogSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const consumeItemSchema = z.object({
  quantity: z.number().finite().positive(),
}).strict();

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const itemScopeQuerySchema = z.object({ familyId: z.string().uuid() });
