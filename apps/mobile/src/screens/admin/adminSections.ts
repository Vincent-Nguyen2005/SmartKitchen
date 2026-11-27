/**
 * Quản trị sections (pure; covered by adminSections.test.ts): the one top tab bar, left to right. "Thống kê" was
 * merged into Tổng quan; checkout promotions and daily deals share Khuyến mãi; the tab says "Giao hàng" (the screen
 * keeps "Người giao hàng" in its texts). No "Báo cáo": users and shippers have no way to send a report from the app
 * (admin-service keeps its /reports endpoints and data).
 */
export type AdminSection = "dashboard" | "ingredients" | "recipes" | "promotions" | "shippers";

export const ADMIN_SECTIONS: ReadonlyArray<{ key: AdminSection; label: string }> = [
  { key: "dashboard", label: "Tổng quan" },
  { key: "ingredients", label: "Nguyên liệu" },
  { key: "recipes", label: "Món ăn" },
  { key: "promotions", label: "Khuyến mãi" },
  { key: "shippers", label: "Giao hàng" },
];

export const isAdminSection = (value: unknown): value is AdminSection => ADMIN_SECTIONS.some((section) => section.key === value);

/**
 * The selected tab survives AdminHome remounting (a payment page, a token refresh) for the app session; an unknown
 * value (e.g. an old "overview" or "reports" value) falls back to Tổng quan.
 */
let lastSection: AdminSection = "dashboard";
export const adminSectionMemory = {
  get: (): AdminSection => lastSection,
  set: (value: unknown): AdminSection => { lastSection = isAdminSection(value) ? value : "dashboard"; return lastSection; },
};
