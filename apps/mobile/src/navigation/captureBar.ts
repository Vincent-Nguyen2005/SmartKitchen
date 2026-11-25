/**
 * Where the bottom "Chụp ảnh / QR hóa đơn / Giọng nói" bar (adds food to Kho) is shown: the food tabs only.
 * Not on Thông báo, Gia đình, Dinh dưỡng or Quản trị, and never while Hồ sơ (or one of its screens) or a payment
 * page is open. Pure, covered by captureBar.test.ts.
 */
export const CAPTURE_BAR_TABS = ["inventory", "shopping", "menu", "recipes"] as const;

export function captureBarVisible(state: { tab: string; isAdmin: boolean; profileOpen: boolean; paymentOpen: boolean }): boolean {
  if (state.isAdmin || state.profileOpen || state.paymentOpen) return false;
  return (CAPTURE_BAR_TABS as readonly string[]).includes(state.tab);
}
