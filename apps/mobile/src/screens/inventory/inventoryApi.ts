import { Platform } from "react-native";
import { File } from "expo-file-system";
import { ApiError, gatewayFetch } from "../../services/api";
import { appendPhoto } from "./photoUpload";

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

async function request<T>(accessToken: string, path: string, options: Omit<RequestInit, "headers" | "signal"> & { signal?: AbortSignal } = {}, timeoutMs = 15_000): Promise<T> {
  // Shared gateway transport (services/api.ts); FormData keeps its own multipart content type.
  const response = await gatewayFetch(path, { ...options, accessToken, timeoutMs });
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T> & { code?: string };
  if (!response.ok || payload.success === false) {
    // The inventory service puts its error code (e.g. PHOTO_TOO_LARGE) in `error` and the text in `message`.
    const code = payload.code ?? (typeof payload.error === "string" && /^[A-Z][A-Z0-9_]+$/.test(payload.error) ? payload.error : undefined);
    throw new ApiError(payload.message || payload.error || payload.code || `Yêu cầu thất bại (${response.status})`, response.status, undefined, code);
  }
  return (payload.data !== undefined ? payload.data : payload) as T;
}

/** Multipart body with one photo (see photoUpload.ts for why phones send the bytes, not only the file uri). */
const photoForm = async (photo: UploadPhoto): Promise<FormData> => {
  const form = new FormData();
  await appendPhoto(form, photo, { isWeb: Platform.OS === "web", readBytes: (uri) => new File(uri).bytes() });
  return form;
};

const query = (values: Record<string, string | number>) =>
  `?${Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&")}`;

/** POST /api/inventory/photo/suggest: catalog names guessed from a photo (best first); empty when unsure. */
export type PhotoSuggestResult = { suggestions: Array<{ name: string; catalogId: string; productId: string; imageUrl: string | null; score: number | null }>; confident: boolean; autofill: boolean; source: "clip" | "gemini" | null };
/** GET /api/inventory/items/match: the catalog product a name matches and the family's existing row (same unit). */
export type ItemMatch = {
  product: { id: string; name: string; imageUrl: string | null } | null;
  existing: import("./types").FoodItem | null;
  otherUnits: number;
};
/** A photo ready to upload: `blob` on web, a file `uri` on native. */
export type UploadPhoto = { uri: string; mimeType: ReceiptMimeType; name: string; blob?: Blob };
/** One active product from the admin catalog (GET /api/admin/catalog/ingredients). */
export type CatalogIngredient = {
  id: string;
  name: string;
  group: string;
  /** Unit code (GRAM, KILOGRAM, ...) or an older free-text label such as "g". */
  unit: string;
  shelfLifeDays: number | null;
  imageUrl: string | null;
  /** Credit of a Wikimedia Commons image (page URL, author, license); absent for links an admin pasted. */
  imageSource?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  /** Set only while the promotion is still valid. */
  discountPercent: number | null;
  promoEndDate: string | null;
  /** Whole VND, or null when the admin set no price. */
  price: number | null;
  /** Grams in one pack / bunch (PACK / PIECE products, e.g. Hành lá 1 bó ≈ 100 g); null or absent when unknown. */
  packGrams?: number | null;
  /** Word for one piece-type unit ("quả", "bìa"...); null / absent = the unit's own word ("cái", "chai"...). */
  unitLabel?: string | null;
};
export type CatalogPage = { items: CatalogIngredient[]; page: number; limit: number; total: number; totalPages: number; groups: string[] };
/** `ids`: only these products (Đi chợ: this week's missing products first); at most 100. */
export type CatalogQuery = { search?: string; group?: string; onSale?: boolean; page?: number; limit?: number; ids?: string[] };


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
  /** Before adding: catalog product for the name (server rule: exact normalized name) and an existing same-unit row. */
  match: (accessToken: string, familyId: string, name: string, unit: InventoryUnit, signal?: AbortSignal) =>
    request<ItemMatch>(accessToken, `/api/inventory/items/match${query({ familyId, name, unit })}`, { signal }),
  /** "Cộng thêm": adds quantity to an existing row on the server (atomic; same unit only). */
  addQuantity: (accessToken: string, familyId: string, id: string, input: { quantity: number; unit: InventoryUnit; expiryDate?: string }) =>
    request<import("./types").FoodItem>(accessToken, `/api/inventory/items/${encodeURIComponent(id)}/add${query({ familyId })}`, { method: "POST", body: JSON.stringify(input) }),
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
  uploadPhoto: async (accessToken: string, itemId: string, photo: UploadPhoto) =>
    request<{ id: string; imageUrl: string }>(accessToken, `/api/inventory/items/${encodeURIComponent(itemId)}/photo`, { method: "POST", body: await photoForm(photo) }, 60_000),
  /**
   * Kho "Chụp ảnh": up to 3 catalog names suggested from the (already downscaled) photo. The photo is analysed
   * on the server and not stored; the item photo is still uploaded separately after saving.
   */
  suggestFromPhoto: async (accessToken: string, photo: UploadPhoto) =>
    request<PhotoSuggestResult>(accessToken, "/api/inventory/photo/suggest", { method: "POST", body: await photoForm(photo) }, 25_000),
  deletePhoto: (accessToken: string, itemId: string) =>
    request<{ id: string; imageUrl: null }>(accessToken, `/api/inventory/items/${encodeURIComponent(itemId)}/photo`, { method: "DELETE" }),
  /** Hồ sơ avatar: stored like Kho photos (re-encoded to 512 px); save the returned URL with authApi.updateMe. */
  uploadAvatar: async (accessToken: string, photo: UploadPhoto) =>
    request<{ avatarUrl: string }>(accessToken, "/api/inventory/avatars", { method: "POST", body: await photoForm({ ...photo, name: "avatar.jpg" }) }, 60_000),
  /**
   * Nấu ăn "Hoàn thành": takes the dish's ingredients out of Kho (earliest expiry first; g/kg, packs and pieces
   * converted). `cookId` makes a retried request a no-op.
   */
  cook: (accessToken: string, body: { familyId: string; cookId: string; dishName?: string; ingredients: Array<{ name: string; quantity: number; unit: string }> }) =>
    request<{ alreadyApplied: boolean; lines: Array<{ name: string; quantity: number; unit: string; used: number; missing: number }> }>(accessToken, "/api/inventory/cook", { method: "POST", body: JSON.stringify(body) }),
  /** Admin product catalog (active rows only), readable by any signed-in user; search is accent-insensitive. */
  ingredientCatalog: (accessToken: string, options: CatalogQuery = {}) => {
    const params: Record<string, string | number> = { page: options.page ?? 1, limit: options.limit ?? 20 };
    if (options.search?.trim()) params.search = options.search.trim();
    if (options.group) params.group = options.group;
    if (options.onSale) params.onSale = "true";
    if (options.ids?.length) params.ids = options.ids.slice(0, 100).join(",");
    return request<CatalogPage>(accessToken, `/api/admin/catalog/ingredients${query(params)}`);
  },
  recognizeReceipt: (accessToken: string, imageBase64: string, mimeType: ReceiptMimeType) =>
    request<{ rawText: string; items: Array<{ name: string; quantity: number; unit: InventoryUnit; sourceText: string }> }>(
      accessToken,
      "/api/inventory/receipts/ocr",
      { method: "POST", body: JSON.stringify({ imageBase64, mimeType }) },
    ),
};
