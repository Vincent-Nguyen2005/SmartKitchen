import { Platform } from "react-native";
import { GATEWAY_BASE_URL, gatewayHeaders } from "../../services/api";

// Same gateway resolution as auth/family (services/api.ts): a separate copy here skipped the ngrok
// header and the web dev host, so the Kho screen failed with "Không kết nối được máy chủ".
const API_BASE_URL = GATEWAY_BASE_URL;

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
  /** ISO date-time, e.g. 2026-12-31T00:00:00.000Z. */
  expiryDate?: string;
  /** Free-text group ("Nhóm"). */
  categoryName?: string;
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

async function request<T>(accessToken: string, path: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...gatewayHeaders(),
        // FormData sets its own multipart boundary.
        ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
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

/** A photo ready to upload: `blob` on web, a file `uri` on native. */
export type UploadPhoto = { uri: string; mimeType: ReceiptMimeType; name: string; blob?: Blob };
export type CatalogIngredient = { id: string; name: string; category: string; defaultUnit: string; shelfLifeDays: number | null };

/** Absolute URL and auth headers for an item photo; external URLs (e.g. Open Food Facts) need no headers. */
export const photoRequest = (imageUrl: string, accessToken: string | null): { uri: string; headers?: Record<string, string> } => {
  if (/^https?:\/\//i.test(imageUrl)) return { uri: imageUrl };
  return {
    uri: `${API_BASE_URL}${imageUrl}`,
    headers: { ...gatewayHeaders(), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  };
};

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
  uploadPhoto: (accessToken: string, itemId: string, photo: UploadPhoto) => {
    const form = new FormData();
    if (Platform.OS === "web" && photo.blob) form.append("photo", photo.blob, photo.name);
    // React Native's FormData reads the file from `uri`; the object form is RN-specific.
    else form.append("photo", { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
    return request<{ id: string; imageUrl: string }>(accessToken, `/api/inventory/items/${encodeURIComponent(itemId)}/photo`, { method: "POST", body: form }, 60_000);
  },
  deletePhoto: (accessToken: string, itemId: string) =>
    request<{ id: string; imageUrl: null }>(accessToken, `/api/inventory/items/${encodeURIComponent(itemId)}/photo`, { method: "DELETE" }),
  /** Admin ingredient catalog (active rows; name, group, unit, shelf-life days) readable by any signed-in user. */
  ingredientCatalog: (accessToken: string) =>
    request<{ items: CatalogIngredient[] }>(accessToken, "/api/admin/catalog/ingredients"),
  recognizeReceipt: (accessToken: string, imageBase64: string, mimeType: ReceiptMimeType) =>
    request<{ rawText: string; items: Array<{ name: string; quantity: number; unit: InventoryUnit; sourceText: string }> }>(
      accessToken,
      "/api/inventory/receipts/ocr",
      { method: "POST", body: JSON.stringify({ imageBase64, mimeType }) },
    ),
};
