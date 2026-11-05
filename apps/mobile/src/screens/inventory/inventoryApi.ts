import { Platform } from "react-native";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/+$/, "");

export type InventoryUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export type ReceiptMimeType = "image/jpeg" | "image/png" | "image/webp";
export type InventoryLocation = "FRIDGE" | "FREEZER" | "PANTRY" | "COUNTER";
export type NewFoodItem = {
  familyId: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  storageLocation: InventoryLocation;
  barcode?: string;
};
export type UpdateFoodItem = Partial<Omit<NewFoodItem, "familyId" | "expiryDate">> & { expiryDate?: string | null; status?: string };
export type ExpiringInventoryItem = import("./types").FoodItem & { daysLeft: number };
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
  list: async (accessToken: string, familyId: string) => {
    const first = await request<{ items: import("./types").FoodItem[]; pagination: { totalPages: number } }>(
      accessToken,
      `/api/inventory/items${query({ familyId, page: 1, limit: 100 })}`,
    );
    if (!Array.isArray(first.items) || !Number.isInteger(first.pagination?.totalPages) || first.pagination.totalPages < 1) {
      throw new Error("Máy chủ trả về danh sách kho không hợp lệ. Hãy tải lại sau.");
    }
    if (first.pagination.totalPages > 100) {
      throw new Error("Kho có quá nhiều trang để tải an toàn. Hãy thu hẹp kết quả rồi thử lại.");
    }
    const items = [...first.items];
    const totalPages = first.pagination.totalPages;
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await request<{ items: import("./types").FoodItem[] }>(
        accessToken,
        `/api/inventory/items${query({ familyId, page, limit: 100 })}`,
      );
      if (!Array.isArray(next.items)) throw new Error(`Trang ${page} của kho trả về dữ liệu không hợp lệ.`);
      items.push(...next.items);
    }
    return { items };
  },
  create: (accessToken: string, input: NewFoodItem) =>
    request<import("./types").FoodItem>(accessToken, "/api/inventory/items", { method: "POST", body: JSON.stringify(input) }),
  update: (accessToken: string, familyId: string, id: string, input: UpdateFoodItem) =>
    request<import("./types").FoodItem>(accessToken, `/api/inventory/items/${encodeURIComponent(id)}${query({ familyId })}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (accessToken: string, familyId: string, id: string) =>
    request<{ message: string }>(accessToken, `/api/inventory/items/${encodeURIComponent(id)}${query({ familyId })}`, { method: "DELETE" }),
  consume: (accessToken: string, familyId: string, id: string, quantity: number) =>
    request<import("./types").FoodItem>(accessToken, `/api/inventory/items/${encodeURIComponent(id)}/consume${query({ familyId })}`, { method: "POST", body: JSON.stringify({ quantity }) }),
  expiring: (accessToken: string, familyId: string, days = 3) =>
    request<{ items: ExpiringInventoryItem[]; count: number; thresholdDays: number }>(accessToken, `/api/inventory/alerts/expiring${query({ familyId, days })}`),
  refreshAlerts: (accessToken: string, familyId: string, days = 3) =>
    request<{ updatedCount: number }>(accessToken, `/api/inventory/alerts/refresh${query({ familyId, days })}`, { method: "POST" }),
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
  recognizeReceipt: (accessToken: string, imageBase64: string, mimeType: ReceiptMimeType) =>
    request<{ rawText: string; items: Array<{ name: string; quantity: number; unit: InventoryUnit; sourceText: string }> }>(
      accessToken,
      "/api/inventory/receipts/ocr",
      { method: "POST", body: JSON.stringify({ imageBase64, mimeType }) },
    ),
};
