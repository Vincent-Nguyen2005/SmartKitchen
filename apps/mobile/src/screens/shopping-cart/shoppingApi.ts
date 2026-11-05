import { Platform } from "react-native";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/+$/, "");

export type ShoppingUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
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
export type ShoppingSuggestion = { name: string; count: number; unit: ShoppingUnit };

type ApiPayload<T> = { success?: boolean; data?: T; lists?: T; message?: string; code?: string; error?: string };

async function request<T>(accessToken: string, path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ gateway rồi thử lại.");
  } finally {
    clearTimeout(timer);
  }
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
  addItem: (token: string, input: { familyId: string; name: string; quantity: number; unit: ShoppingUnit }) =>
    request<ShoppingItem>(token, "/api/shopping-list/items", "POST", input),
  confirmPurchase: (token: string, familyId: string, itemId: string) =>
    request<{ item: ShoppingItem; inventoryItemId: string | null; alreadyApplied: boolean; alreadyPurchased: boolean }>(
      token,
      `/api/shopping-list/items/${encodeURIComponent(itemId)}/purchase${familyQuery(familyId)}`,
      "POST",
    ),
};
