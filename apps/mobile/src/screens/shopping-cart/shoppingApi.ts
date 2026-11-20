import { gatewayFetch } from "../../services/api";

export type ShoppingUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export const shoppingUnits: ShoppingUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
export const shoppingUnitLabels: Record<ShoppingUnit, string> = {
  PIECE: "Cái", PACK: "Gói", BOX: "Hộp", BOTTLE: "Chai", CAN: "Lon",
  GRAM: "Gram", KILOGRAM: "Kg", MILLILITER: "Ml", LITER: "Lít",
};
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

async function request<T>(accessToken: string, path: string, method: RequestInit["method"] = "GET", body?: unknown): Promise<T> {
  // Shared gateway transport: ngrok header, Bearer token, timeout and the network error message.
  const response = await gatewayFetch(path, { method, accessToken, body: body === undefined ? undefined : JSON.stringify(body) });
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
  addItem: (token: string, input: { familyId: string; name: string; quantity: number; unit: ShoppingUnit }) =>
    request<ShoppingItem>(token, "/api/shopping-list/items", "POST", input),
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
