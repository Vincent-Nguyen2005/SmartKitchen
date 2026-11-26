/** The bar's three buttons, left to right (icons are mapped in App.tsx). */
export const CAPTURE_ACTIONS = [
  { key: "photo", label: "Chụp ảnh" },
  { key: "familyQr", label: "QR gia đình" },
  { key: "spending", label: "Chi tiêu" },
] as const;
export type CaptureActionKey = (typeof CAPTURE_ACTIONS)[number]["key"];

/**
 * Where the bottom "Chụp ảnh / QR gia đình / Chi tiêu" bar is shown: Kho, Đi chợ, Lịch, Nấu ăn,
 * Dinh dưỡng and Gia đình. Hidden on Thông báo, while Hồ sơ (or one of its screens) is open, on a payment page, and
 * for admin accounts (Quản trị). Pure, covered by captureBar.test.ts.
 */
export const CAPTURE_BAR_TABS = ["inventory", "shopping", "menu", "recipes", "nutrition", "family"] as const;

/** `selecting`: Đi chợ selection mode, whose one-line selection bar replaces the capture bar until it ends. */
export function captureBarVisible(state: { tab: string; isAdmin: boolean; profileOpen: boolean; paymentOpen: boolean; selecting?: boolean }): boolean {
  if (state.isAdmin || state.profileOpen || state.paymentOpen || state.selecting) return false;
  return (CAPTURE_BAR_TABS as readonly string[]).includes(state.tab);
}
