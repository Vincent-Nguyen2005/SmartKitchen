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

/** Vietnamese phone: 0xxxxxxxxx or +84xxxxxxxxx (spaces, dots and dashes are ignored). */
const vnPhone = z.string().trim().transform((value) => value.replace(/[\s.-]/g, "")).refine((value) => /^(?:\+84|84|0)(?:3|5|7|8|9|2\d)\d{8}$/.test(value), "Số điện thoại không hợp lệ");

/** Delivery details of an order ("Đặt hàng"); COD is the only payment method. */
export const deliverySchema = z.object({
  address: z.string().trim().min(5, "Nhập địa chỉ giao hàng").max(300),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  receiverName: z.string().trim().min(1, "Nhập tên người nhận").max(100),
  receiverPhone: vnPhone,
  note: z.string().trim().max(300).nullable().optional(),
  paymentMethod: z.literal("COD").default("COD"),
});

/**
 * "Đặt hàng" in Giỏ hàng: the cart becomes a delivery order. `items` only adds catalog details per cart line (group,
 * shelf-life days for the expiry on delivery).
 */
const checkoutItemsSchema = z.array(z.object({
  id: z.string().uuid(),
  categoryName: z.string().trim().min(1).max(50).optional(),
  shelfLifeDays: z.number().int().min(0).max(3650).optional(),
})).max(200).default([]);
export const checkoutBodySchema = z.object({
  familyId: z.string().uuid(),
  delivery: deliverySchema,
  items: checkoutItemsSchema,
  /** "Tổng thanh toán" the app showed; a different server total answers 409 TOTAL_CHANGED (nothing written). */
  expectedTotal: z.number().int().min(0).optional(),
});
/** POST /checkout/preview: Tạm tính / Khuyến mãi / Tổng thanh toán for the active cart. */
export const checkoutPreviewBodySchema = z.object({ familyId: z.string().uuid(), items: checkoutItemsSchema });

export const generateBodySchema = z.object({ familyId: z.string().uuid() });

export const ordersQuerySchema = z.object({
  familyId: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
/** Shipper lists; lat / lng (the shipper's position, optional) sort waiting orders by distance and add it. */
export const shipperOrdersQuerySchema = z.object({
  scope: z.enum(["available", "mine", "history"]).default("available"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export const failOrderBodySchema = z.object({ reason: z.string().trim().min(1, "Nhập lý do").max(300) });

/** GET /spending ("Chi tiêu"): a Vietnam month (default: the current one) of the family's purchases. */
export const spendingQuerySchema = z.object({
  familyId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM").optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
