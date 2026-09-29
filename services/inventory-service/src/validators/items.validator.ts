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
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  quantity: z.number().min(0).default(0),
  unit: UnitEnum.default("PIECE"),
  minQuantity: z.number().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  storageLocation: StorageLocationEnum.default("FRIDGE"),
  expiryDate: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  imageUrl: z.string().url().optional(),
});

export const updateItemSchema = createItemSchema.partial().extend({
  status: ItemStatusEnum.optional(),
});

export const listItemsQuerySchema = z.object({
  familyId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: ItemStatusEnum.optional(),
  storageLocation: StorageLocationEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
