/**
 * Quản trị bottom bar (pure; covered by adminBar.test.ts): the user capture bar's look with admin actions —
 * "Chụp ảnh" (set a catalog image) · "Đơn hàng" (centre, the round primary button) · "Doanh thu". Đơn hàng and
 * Doanh thu open full-screen pages over the current section (like Chi tiêu for users); Chụp ảnh opens its sheet.
 */
export type AdminBarAction = "photo" | "orders" | "revenue";
export const ADMIN_BAR_ACTIONS: ReadonlyArray<{ key: AdminBarAction; label: string; primary?: boolean }> = [
  { key: "photo", label: "Chụp ảnh" },
  { key: "orders", label: "Đơn hàng", primary: true },
  { key: "revenue", label: "Doanh thu" },
];

/** What a bar tap opens: the photo sheet, or one full-screen page (only one open at a time). */
export type AdminOverlay = AdminBarAction | null;
export const overlayFor = (action: AdminBarAction): AdminOverlay => action;
