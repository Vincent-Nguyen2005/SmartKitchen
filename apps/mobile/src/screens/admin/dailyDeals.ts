/**
 * Quản trị › "Khuyến mãi" (Giảm giá tự động; pure, covered by dailyDeals.test.ts): the "Hôm nay" / "Cài đặt" tabs,
 * settings form, client validation (the same rules as admin-service), and the texts of today's list. Users see these
 * discounts exactly like admin discounts.
 */
import { discountedPrice, formatVnd } from "../../services/format";
import { unitWord } from "../shopping-cart/unitDisplay";

export type DealSettings = { enabled: boolean; dealsPerDay: number; minPercent: number; maxPercent: number; excludedProductIds: string[] };
export type DealStatus = "APPLIED" | "EXCLUDED" | "MANUAL_DISCOUNT" | "INACTIVE" | "OFF";
export type TodayDeal = {
  productId: string; name: string; group: string | null; price: number | null; percent: number; source: "MENU" | "RANDOM" | "SWAP"; status: DealStatus;
  /** Sale unit code and specific word (older servers may omit them). */
  unit?: string | null; unitLabel?: string | null;
};

/** Segment tabs: "Hôm nay" (default) and "Cài đặt". */
export type DealTab = "today" | "settings";
export const DEAL_TABS: ReadonlyArray<{ value: DealTab; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "settings", label: "Cài đặt" },
];
/** The chosen tab, remembered while the admin session lasts (like adminSectionMemory). */
let lastTab: DealTab = "today";
export const dealTabMemory = {
  get: (): DealTab => lastTab,
  set: (value: unknown): DealTab => { lastTab = value === "settings" ? "settings" : "today"; return lastTab; },
};
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


/** "Thứ Sáu, 27/11/2026" for the list header. */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const names = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${names[date.getUTCDay()]}, ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** "Giảm 5–20%" ("Giảm 10%" when both ends are equal). */
export const percentRangeText = (settings: Pick<DealSettings, "minPercent" | "maxPercent">): string =>
  `Giảm ${settings.minPercent === settings.maxPercent ? settings.minPercent : `${settings.minPercent}–${settings.maxPercent}`}%`;

/** "Hôm nay" header: "Thứ Bảy, 28/11/2026 · Giảm 5–20%". */
export const todayHeader = (day: string, settings: Pick<DealSettings, "minPercent" | "maxPercent">): string => `${dayLabel(day)} · ${percentRangeText(settings)}`;

/**
 * A row's second line, in parts so the original price can be struck through: "12.000đ" → "11.500đ / gói" (the same
 * rounding and unit words as Đi chợ). null when the product has no price.
 */
export function dealPriceParts(deal: Pick<TodayDeal, "price" | "percent" | "unit" | "unitLabel">): { original: string; discounted: string } | null {
  if (deal.price === null) return null;
  const unit = deal.unit ? ` / ${unitWord(deal.unit, deal.unitLabel)}` : "";
  return { original: formatVnd(deal.price), discounted: `${formatVnd(discountedPrice(deal.price, deal.percent))}${unit}` };
}

/** "Đổi nguyên liệu" toast: "Đã đổi sang <tên>" (the product that came in), or a generic text when it is unknown. */
export function swapNotice(before: ReadonlyArray<Pick<TodayDeal, "productId">>, after: ReadonlyArray<Pick<TodayDeal, "productId" | "name">>): string {
  const known = new Set(before.map((deal) => deal.productId));
  const added = after.find((deal) => !known.has(deal.productId));
  return added ? `Đã đổi sang ${added.name}` : "Đã đổi nguyên liệu";
}
