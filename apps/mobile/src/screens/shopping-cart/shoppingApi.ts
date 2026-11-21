import { gatewayFetch } from "../../services/api";
import { UNIT_LABELS } from "../inventory/catalogSuggest";

export type ShoppingUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export const shoppingUnits: ShoppingUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
/** Same short Vietnamese labels as Kho (g, kg, ml, lít, cái/quả, ...). */
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
};
/** Optional market snapshot sent when adding to the cart. */
export type CartSnapshot = { unitPrice?: number | null; discountPercent?: number | null; productId?: string | null; imageUrl?: string | null };
export type CheckoutLine = { id: string; categoryName?: string; shelfLifeDays?: number };
export type CheckoutResult = {
  purchased: Array<{ id: string; name: string; inventoryItemId: string | null }>;
  failed: Array<{ id: string; name: string; code: string; message: string }>;
  listCompleted: boolean;
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

async function request<T>(accessToken: string, path: string, method: RequestInit["method"] = "GET", body?: unknown, timeoutMs?: number): Promise<T> {
  // Shared gateway transport: ngrok header, Bearer token, timeout and the network error message.
  const response = await gatewayFetch(path, { method, accessToken, timeoutMs, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.code || payload.error || `Yêu cầu thất bại (${response.status})`);
  }
  if (payload.data !== undefined) return payload.data;
  if (payload.lists !== undefined) return payload.lists as T;
  return payload as T;
}

const familyQuery = (familyId: string) => `?familyId=${encodeURIComponent(familyId)}`;

export const shoppingApi = {
  list: (token: string, familyId: string) => request<ShoppingList[]>(token, `/api/shopping-list/${familyQuery(familyId)}`),
  suggestions: (token: string, familyId: string) => request<ShoppingSuggestion[]>(token, `/api/shopping-list/suggestions${familyQuery(familyId)}`),
  generateFromMenu: (token: string, familyId: string) =>
    request<{ menuId: string; message: string; items: ShoppingItem[]; listId: string | null }>(token, "/api/shopping-list/generate", "POST", { familyId }),
  /** Adds to Giỏ hàng; the same product + unit already in the cart only gets a higher quantity (server-side). */
  addItem: (token: string, input: { familyId: string; name: string; quantity: number; unit: ShoppingUnit } & CartSnapshot) =>
    request<ShoppingItem>(token, "/api/shopping-list/items", "POST", input),
  /** "Mua": every cart line goes into Kho; failed lines stay in the cart and are listed in `failed`. */
  checkout: (token: string, familyId: string, items: CheckoutLine[]) =>
    // One inventory call per line on the server, so allow more time than the default 15 s.
    request<CheckoutResult>(token, "/api/shopping-list/checkout", "POST", { familyId, items }, 90_000),
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
