/**
 * Quản trị › "Giảm giá tự động" (pure; covered by dailyDeals.test.ts): settings form, client validation (the same
 * rules as admin-service), and the texts of today's list. Users see these discounts exactly like admin discounts.
 */
export type DealSettings = { enabled: boolean; dealsPerDay: number; minPercent: number; maxPercent: number; excludedProductIds: string[] };
export type DealStatus = "APPLIED" | "EXCLUDED" | "MANUAL_DISCOUNT" | "INACTIVE" | "OFF";
export type TodayDeal = { productId: string; name: string; group: string | null; price: number | null; percent: number; source: "MENU" | "RANDOM" | "SWAP"; status: DealStatus };
export type DealProductOption = { id: string; name: string; group: string };
export type DailyDealsResponse = { day: string; settings: DealSettings & { updatedAt: string | null }; deals: TodayDeal[]; products: DealProductOption[] };

export type SettingsForm = { enabled: boolean; dealsPerDay: string; minPercent: string; maxPercent: string; excludedProductIds: string[] };
export type SettingsField = "dealsPerDay" | "minPercent" | "maxPercent";

export const formOf = (settings: DealSettings): SettingsForm => ({
  enabled: settings.enabled, dealsPerDay: String(settings.dealsPerDay), minPercent: String(settings.minPercent), maxPercent: String(settings.maxPercent), excludedProductIds: settings.excludedProductIds,
});

const whole = (text: string): number => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

/** Inline errors (empty = valid): 1-30 products a day, whole percents 1-50, lowest ≤ highest. */
export function settingsErrors(form: SettingsForm): Partial<Record<SettingsField, string>> {
  const errors: Partial<Record<SettingsField, string>> = {};
  const deals = whole(form.dealsPerDay);
  const min = whole(form.minPercent);
  const max = whole(form.maxPercent);
  if (!(deals >= 1 && deals <= 30)) errors.dealsPerDay = "Từ 1 đến 30 sản phẩm mỗi ngày";
  if (!(min >= 1 && min <= 50)) errors.minPercent = "Phần trăm nguyên từ 1 đến 50";
  if (!(max >= 1 && max <= 50)) errors.maxPercent = "Phần trăm nguyên từ 1 đến 50";
  if (!errors.minPercent && !errors.maxPercent && min > max) errors.maxPercent = "Mức cao nhất phải từ mức thấp nhất trở lên";
  return errors;
}

/** The request body (only call with a valid form). */
export const settingsPayload = (form: SettingsForm): DealSettings => ({
  enabled: form.enabled, dealsPerDay: whole(form.dealsPerDay), minPercent: whole(form.minPercent), maxPercent: whole(form.maxPercent), excludedProductIds: form.excludedProductIds,
});

/** Why a deal of today's list is not applied right now (null when it is). */
export const statusNote = (status: DealStatus): string | null => ({
  APPLIED: null,
  EXCLUDED: "Đã loại trừ, không áp dụng",
  MANUAL_DISCOUNT: "Đang có giảm giá thủ công, không áp dụng",
  INACTIVE: "Sản phẩm đã ẩn",
  OFF: "Đang tắt giảm giá tự động",
}[status]);

/** "Món hay dùng" (popular in this week's menus) / "Ngẫu nhiên" / "Đã đổi". */
export const sourceLabel = (source: TodayDeal["source"]): string => ({ MENU: "Món hay dùng", RANDOM: "Ngẫu nhiên", SWAP: "Đã đổi" }[source]);

/** "Thứ Sáu, 27/11/2026" for the list header. */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const names = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${names[date.getUTCDay()]}, ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** "Giảm 5–20% · 10 sản phẩm mỗi ngày". */
export const settingsSummary = (settings: Pick<DealSettings, "minPercent" | "maxPercent" | "dealsPerDay">): string =>
  `Giảm ${settings.minPercent === settings.maxPercent ? settings.minPercent : `${settings.minPercent}–${settings.maxPercent}`}% · ${settings.dealsPerDay} sản phẩm mỗi ngày`;
