import { gatewayFetch } from "../../services/api";
import { UNIT_LABELS } from "../inventory/catalogSuggest";

export type ShoppingUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export const shoppingUnits: ShoppingUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
/** Same short Vietnamese words as Kho (g, kg, ml, lít, cái, gói, ...); the catalog's piece word wins where known. */
export const shoppingUnitLabels: Record<ShoppingUnit, string> = UNIT_LABELS;
export type ShoppingItem = {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: ShoppingUnit;
  isPurchased: boolean;
  inventoryAppliedAt: string | null;
  inventoryItemId: string | null;
  note?: string | null;
  /** Price snapshot when added from the market (whole VND before discount); null for older/manual items. */
  unitPrice?: number | null;
  discountPercent?: number | null;
  productId?: string | null;
  imageUrl?: string | null;
  /** Set once the line is in a delivery order ("Đặt hàng"): it is no longer in the cart. */
  purchaseId?: string | null;
};
/** Optional market snapshot sent when adding to the cart. */
export type CartSnapshot = { unitPrice?: number | null; discountPercent?: number | null; productId?: string | null; imageUrl?: string | null };
export type CheckoutLine = { id: string; categoryName?: string; shelfLifeDays?: number };
export type OrderStatus = "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "FAILED";
/** Delivery details of "Đặt hàng" (cash on delivery is the only payment method). */
export type DeliveryInput = { address: string; latitude?: number | null; longitude?: number | null; receiverName: string; receiverPhone: string; note?: string | null };
export type OrderLine = { id: string; name: string; quantity: number; unit: ShoppingUnit; unitLabel: string | null; paidUnitPrice: number | null; lineTotal: number | null };
export type Order = {
  id: string;
  status: OrderStatus;
  purchasedAt: string;
  buyerUserId: string | null;
  /** What the family pays (= codAmount): subtotal − discountAmount. */
  total: number;
  /** Before the automatic checkout promotion (older orders: = total). */
  subtotal?: number;
  promotionName?: string | null;
  discountAmount?: number;
  codAmount: number;
  itemCount: number;
  paymentMethod: "COD";
  deliveryAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  note: string | null;
  shippingAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  failReason: string | null;
  /** The shipper once the order is on its way (name and phone only). */
  shipper?: { name: string | null; phone: string | null } | null;
  items: OrderLine[];
};
export type ShoppingList = { id: string; familyId: string; name: string; status: string; items: ShoppingItem[] };
export type ShoppingSuggestion = {
  name: string;
  unit: ShoppingUnit;
  suggestedQuantity: number;
  consumedQuantity: number;
  availableQuantity: number;
  dailyConsumption: number;
  periodDays: number;
  historyDays: number;
  consumptionEvents: number;
  lastConsumedAt: string;
};

type ApiPayload<T> = { success?: boolean; data?: T; lists?: T; message?: string; code?: string; error?: string };

/** Checkout totals from the server (POST /checkout/preview, and the data of a TOTAL_CHANGED answer). */
export type CheckoutPreview = {
  subtotal: number;
  promotion: { id: string; name: string; discount: number } | null;
  discount: number;
  total: number;
  /** "Mua thêm 30.000 đ để được <tên>". */
  hint: { name: string; missing: number; text: string } | null;
};

/** A refused request with the server's code (e.g. TOTAL_CHANGED) and data (the new totals). */
export class ShoppingApiError extends Error {
  constructor(message: string, readonly code: string | null, readonly data: unknown) {
    super(message);
    this.name = "ShoppingApiError";
  }
}

async function request<T>(accessToken: string, path: string, method: RequestInit["method"] = "GET", body?: unknown, timeoutMs?: number): Promise<T> {
  // Shared gateway transport: ngrok header, Bearer token, timeout and the network error message.
  const response = await gatewayFetch(path, { method, accessToken, timeoutMs, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.success === false) {
    throw new ShoppingApiError(payload.message || payload.code || payload.error || `Yêu cầu thất bại (${response.status})`, payload.code ?? null, payload.data ?? null);
  }
  if (payload.data !== undefined) return payload.data;
  if (payload.lists !== undefined) return payload.lists as T;
  return payload as T;
}

const familyQuery = (familyId: string) => `?familyId=${encodeURIComponent(familyId)}`;

export const shoppingApi = {
  /** "Chi tiêu": one Vietnam month (YYYY-MM) of the family's completed purchases; members only (403 otherwise). */
  spending: <T>(token: string, familyId: string, month: string) =>
    request<T>(token, `/api/shopping-list/spending${familyQuery(familyId)}&month=${encodeURIComponent(month)}&limit=100`),
  list: (token: string, familyId: string) => request<ShoppingList[]>(token, `/api/shopping-list/${familyQuery(familyId)}`),
  suggestions: (token: string, familyId: string) => request<ShoppingSuggestion[]>(token, `/api/shopping-list/suggestions${familyQuery(familyId)}`),
  generateFromMenu: (token: string, familyId: string) =>
    request<{ menuId: string; message: string; items: ShoppingItem[]; listId: string | null }>(token, "/api/shopping-list/generate", "POST", { familyId }),
  /** Adds to Giỏ hàng; the same product + unit already in the cart only gets a higher quantity (server-side). */
  addItem: (token: string, input: { familyId: string; name: string; quantity: number; unit: ShoppingUnit } & CartSnapshot) =>
    request<ShoppingItem>(token, "/api/shopping-list/items", "POST", input),
  /** "Mua": every cart line goes into Kho; failed lines stay in the cart and are listed in `failed`. */
  /** "Đặt hàng": the cart becomes a delivery order paid on delivery; its lines show "Đang giao" in Kho. */
  /** expectedTotal: the "Tổng thanh toán" shown; a different server total → ShoppingApiError TOTAL_CHANGED with the new totals. */
  placeOrder: (token: string, familyId: string, items: CheckoutLine[], delivery: DeliveryInput, expectedTotal?: number) =>
    request<{ order: Order }>(token, "/api/shopping-list/checkout", "POST", { familyId, items, delivery: { ...delivery, paymentMethod: "COD" }, ...(expectedTotal !== undefined ? { expectedTotal } : {}) }, 30_000),
  /** Tạm tính / Khuyến mãi / Tổng thanh toán for the active cart (the automatic promotion; computed by the server). */
  checkoutPreview: (token: string, familyId: string, items: CheckoutLine[]) =>
    request<CheckoutPreview>(token, "/api/shopping-list/checkout/preview", "POST", { familyId, items }),
  /** The family's orders, newest first. */
  orders: (token: string, familyId: string) =>
    request<{ items: Order[]; total: number }>(token, `/api/shopping-list/orders${familyQuery(familyId)}&limit=50`),
  /** The caller's last delivery details (prefill), or null. */
  lastDelivery: (token: string, familyId: string) =>
    request<{ delivery: { address: string | null; latitude: number | null; longitude: number | null; receiverName: string | null; receiverPhone: string | null } | null }>(token, `/api/shopping-list/orders/last-delivery${familyQuery(familyId)}`),
  /** "Hủy đơn" (only while the order waits for a shipper). */
  cancelOrder: (token: string, familyId: string, orderId: string) =>
    request<{ order: Order }>(token, `/api/shopping-list/orders/${encodeURIComponent(orderId)}/cancel${familyQuery(familyId)}`, "POST", {}),
  updateItem: (token: string, familyId: string, itemId: string, changes: { quantity?: number; note?: string | null }) =>
    request<ShoppingItem>(token, `/api/shopping-list/items/${encodeURIComponent(itemId)}${familyQuery(familyId)}`, "PATCH", changes),
  deleteItem: (token: string, familyId: string, itemId: string) =>
    request<void>(token, `/api/shopping-list/items/${encodeURIComponent(itemId)}${familyQuery(familyId)}`, "DELETE"),
  confirmPurchase: (token: string, familyId: string, itemId: string) =>
    request<{ item: ShoppingItem; inventoryItemId: string | null; alreadyApplied: boolean; alreadyPurchased: boolean }>(
      token,
      `/api/shopping-list/items/${encodeURIComponent(itemId)}/purchase${familyQuery(familyId)}`,
      "POST",
    ),
  completeList: (token: string, familyId: string, listId: string) =>
    request<ShoppingList>(token, `/api/shopping-list/${encodeURIComponent(listId)}/complete${familyQuery(familyId)}`, "PATCH"),
};
