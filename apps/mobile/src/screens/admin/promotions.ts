/**
 * Quản trị › "Chương trình khuyến mãi" (pure; covered by promotions.test.ts): form state, client validation (the same
 * rules shopping-list-service enforces), the request body and the list texts. Promotions apply automatically at
 * checkout (no code); days are Vietnam calendar days.
 */
import { formatVnd } from "../../services/format";

export type PromotionScope = "ORDER" | "GROUP" | "PRODUCTS";
export type PromotionType = "PERCENT" | "AMOUNT";
export type PromotionStatus = "UPCOMING" | "RUNNING" | "ENDED" | "OFF";

/** GET /api/shopping-list/admin/promotions item. */
export type CheckoutPromotion = {
  id: string;
  name: string;
  scope: PromotionScope;
  groups: string[];
  productIds: string[];
  type: PromotionType;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startDate: string;
  endDate: string;
  usageLimitPerUser: number | null;
  isActive: boolean;
  status: PromotionStatus;
};

/** Text inputs stay strings while typing ("50.000" is fine: only the digits count). */
export type PromotionForm = {
  name: string;
  scope: PromotionScope;
  groups: string[];
  productIds: string[];
  type: PromotionType;
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  startDate: string;
  endDate: string;
  usageLimit: string;
  isActive: boolean;
};
export type FormField = "name" | "groups" | "productIds" | "value" | "maxDiscount" | "minSubtotal" | "startDate" | "endDate" | "usageLimit";
export type FormErrors = Partial<Record<FormField, string>>;

export const SCOPE_OPTIONS: Array<{ value: PromotionScope; label: string }> = [
  { value: "ORDER", label: "Toàn đơn hàng" },
  { value: "GROUP", label: "Nhóm hàng" },
  { value: "PRODUCTS", label: "Sản phẩm" },
];
export const TYPE_OPTIONS: Array<{ value: PromotionType; label: string }> = [
  { value: "PERCENT", label: "Phần trăm" },
  { value: "AMOUNT", label: "Số tiền" },
];
export const STATUS_LABELS: Record<PromotionStatus, { label: string; tone: "success" | "primary" | "muted" | "danger" }> = {
  RUNNING: { label: "Đang chạy", tone: "success" },
  UPCOMING: { label: "Sắp diễn ra", tone: "primary" },
  ENDED: { label: "Hết hạn", tone: "muted" },
  OFF: { label: "Tắt", tone: "danger" },
};

const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
/** Today in Vietnam (YYYY-MM-DD). */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export const emptyForm = (today: string = vnToday()): PromotionForm => ({
  name: "", scope: "ORDER", groups: [], productIds: [], type: "PERCENT", value: "", maxDiscount: "", minSubtotal: "",
  startDate: today, endDate: addDays(today, 7), usageLimit: "", isActive: true,
});

export const formFromPromotion = (promotion: CheckoutPromotion): PromotionForm => ({
  name: promotion.name, scope: promotion.scope, groups: promotion.groups, productIds: promotion.productIds, type: promotion.type,
  value: String(promotion.value), maxDiscount: promotion.maxDiscount === null ? "" : String(promotion.maxDiscount),
  minSubtotal: promotion.minSubtotal === null ? "" : String(promotion.minSubtotal), startDate: promotion.startDate, endDate: promotion.endDate,
  usageLimit: promotion.usageLimitPerUser === null ? "" : String(promotion.usageLimitPerUser), isActive: promotion.isActive,
});

/** "50.000" / "50000" / "50 000đ" → 50000; "" → null; anything without digits → NaN. */
export const parseAmount = (text: string): number | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[.\s,đ]/gi, "");
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
};

/** Inline errors per field (empty object = valid). `isNew`: the end day must not be in the past. */
export function formErrors(form: PromotionForm, options: { isNew: boolean; today?: string }): FormErrors {
  const errors: FormErrors = {};
  const today = options.today ?? vnToday();
  if (!form.name.trim()) errors.name = "Nhập tên chương trình";
  else if (form.name.trim().length > 120) errors.name = "Tên tối đa 120 ký tự";
  if (form.scope === "GROUP" && form.groups.length === 0) errors.groups = "Chọn ít nhất một nhóm";
  if (form.scope === "PRODUCTS" && form.productIds.length === 0) errors.productIds = "Chọn ít nhất một sản phẩm";
  const value = parseAmount(form.value);
  if (value === null || Number.isNaN(value)) errors.value = form.type === "PERCENT" ? "Nhập phần trăm giảm" : "Nhập số tiền giảm";
  else if (form.type === "PERCENT" && (value < 1 || value > 100)) errors.value = "Phần trăm từ 1 đến 100";
  else if (form.type === "AMOUNT" && (value < 1_000 || value > 100_000_000)) errors.value = "Số tiền giảm từ 1.000đ";
  const cap = parseAmount(form.maxDiscount);
  if (form.type === "PERCENT" && cap !== null && (Number.isNaN(cap) || cap < 1_000)) errors.maxDiscount = "Giảm tối đa từ 1.000đ";
  const minimum = parseAmount(form.minSubtotal);
  if (minimum !== null && Number.isNaN(minimum)) errors.minSubtotal = "Nhập số tiền";
  const limit = parseAmount(form.usageLimit);
  if (limit !== null && (Number.isNaN(limit) || limit < 1 || limit > 1000)) errors.usageLimit = "Từ 1 đến 1000 lần";
  if (!form.startDate) errors.startDate = "Chọn ngày bắt đầu";
  if (!form.endDate) errors.endDate = "Chọn ngày kết thúc";
  else if (form.startDate && form.endDate < form.startDate) errors.endDate = "Ngày kết thúc phải từ ngày bắt đầu trở đi";
  else if (options.isNew && form.endDate < today) errors.endDate = "Ngày kết thúc phải từ hôm nay trở đi";
  return errors;
}

/** The request body (only call with a valid form). */
export const toPayload = (form: PromotionForm) => ({
  name: form.name.trim(),
  scope: form.scope,
  groups: form.scope === "GROUP" ? form.groups : [],
  productIds: form.scope === "PRODUCTS" ? form.productIds : [],
  type: form.type,
  value: parseAmount(form.value) as number,
  maxDiscount: form.type === "PERCENT" ? parseAmount(form.maxDiscount) : null,
  minSubtotal: parseAmount(form.minSubtotal),
  startDate: form.startDate,
  endDate: form.endDate,
  usageLimitPerUser: parseAmount(form.usageLimit),
  isActive: form.isActive,
});

/** Server field errors ({ details: { fieldErrors } } or { details: { field: [...] } }) → form fields. */
export const serverFieldErrors = (details: unknown): FormErrors => {
  const source = (details && typeof details === "object" && "fieldErrors" in details ? (details as { fieldErrors: unknown }).fieldErrors : details) as Record<string, string[] | undefined> | null;
  const errors: FormErrors = {};
  if (!source || typeof source !== "object") return errors;
  const map: Record<string, FormField> = { usageLimitPerUser: "usageLimit" };
  for (const [key, messages] of Object.entries(source)) {
    const field = (map[key] ?? key) as FormField;
    if (Array.isArray(messages) && messages[0]) errors[field] = messages[0];
  }
  return errors;
};

/** "Giảm 10% · tối đa 50.000đ" / "Giảm 20.000đ". */
export const valueText = (promotion: Pick<CheckoutPromotion, "type" | "value" | "maxDiscount">): string =>
  promotion.type === "PERCENT" ? `Giảm ${promotion.value}%${promotion.maxDiscount ? ` · tối đa ${formatVnd(promotion.maxDiscount)}` : ""}` : `Giảm ${formatVnd(promotion.value)}`;

/** "Toàn đơn hàng" / "Nhóm: Rau củ, Thịt" / "3 sản phẩm". */
export const scopeText = (promotion: Pick<CheckoutPromotion, "scope" | "groups" | "productIds">): string =>
  promotion.scope === "ORDER" ? "Toàn đơn hàng" : promotion.scope === "GROUP" ? `Nhóm: ${promotion.groups.join(", ")}` : `${promotion.productIds.length} sản phẩm`;

/** "Đơn từ 200.000đ · 2 lần/người" (empty when there is no condition). */
export const conditionText = (promotion: Pick<CheckoutPromotion, "minSubtotal" | "usageLimitPerUser">): string =>
  [promotion.minSubtotal ? `Đơn từ ${formatVnd(promotion.minSubtotal)}` : null, promotion.usageLimitPerUser ? `${promotion.usageLimitPerUser} lần/người` : null].filter(Boolean).join(" · ");

/** "01/12/2026 – 31/12/2026". */
export const periodText = (startDate: string, endDate: string): string => {
  const show = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  return `${show(startDate)} – ${show(endDate)}`;
};
