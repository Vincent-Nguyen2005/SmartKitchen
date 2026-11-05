import { Platform } from "react-native";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/+$/, "");

export type InventoryUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export type NewFoodItem = {
  familyId: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  storageLocation: "FRIDGE" | "FREEZER" | "PANTRY" | "COUNTER";
  barcode?: string;
};
export type ProductCatalogResult = {
  barcode: string;
  name: string;
  brand?: string;
  packageQuantity?: string;
  imageUrl?: string;
};

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string; message?: string };

async function request<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
      signal: controller.signal,
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ gateway rồi thử lại.");
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T> & { code?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.error || payload.code || `Yêu cầu thất bại (${response.status})`);
  }
  return (payload.data !== undefined ? payload.data : payload) as T;
}

const query = (values: Record<string, string | number>) =>
  `?${Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;

export const inventoryApi = {
  list: (accessToken: string, familyId: string) =>
    request<{ items: import("./types").FoodItem[] }>(accessToken, `/api/inventory/items${query({ familyId, limit: 100 })}`),
  create: (accessToken: string, input: NewFoodItem) =>
    request<import("./types").FoodItem>(accessToken, "/api/inventory/items", { method: "POST", body: JSON.stringify(input) }),
  lookupBarcode: (accessToken: string, barcode: string) =>
    request<{ found: boolean; barcode: string; product: null | { barcode: string; name: string; brand?: string; packageQuantity?: string; imageUrl?: string }; source: string }>(
      accessToken,
      `/api/inventory/items/barcode/${encodeURIComponent(barcode)}`,
    ),
  searchCatalog: (accessToken: string, queryText: string) =>
    request<{ results: ProductCatalogResult[]; source: string }>(
      accessToken,
      `/api/inventory/items/catalog/search${query({ q: queryText })}`,
    ),
  recognizeReceipt: (accessToken: string, imageBase64: string) =>
    request<{ rawText: string; items: Array<{ name: string; quantity: number; unit: InventoryUnit; sourceText: string }> }>(
      accessToken,
      "/api/inventory/receipts/ocr",
      { method: "POST", body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }) },
    ),
};
