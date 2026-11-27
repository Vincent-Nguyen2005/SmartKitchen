/**
 * Category line of a Thông báo card (pure, covered by notificationCategory.test.ts): label and icon key. Order
 * notices ("Đơn hàng đang được giao" ...) are SYSTEM rows with data.type "order" and show as "Đơn hàng" with a truck.
 */
export type CategoryIcon = "tag" | "clock" | "cart" | "info" | "truck";
type NoticeLike = { type: "PROMOTION" | "EXPIRY_ALERT" | "SHOPPING_REMINDER" | "SYSTEM"; data?: { type?: string } | null };

const BY_TYPE: Record<NoticeLike["type"], { label: string; icon: CategoryIcon }> = {
  PROMOTION: { label: "Khuyến mãi", icon: "tag" },
  EXPIRY_ALERT: { label: "Sắp hết hạn", icon: "clock" },
  SHOPPING_REMINDER: { label: "Nhắc đi chợ", icon: "cart" },
  SYSTEM: { label: "Hệ thống", icon: "info" },
};

export const notificationCategory = (notice: NoticeLike): { label: string; icon: CategoryIcon } =>
  notice.data?.type === "order" ? { label: "Đơn hàng", icon: "truck" } : BY_TYPE[notice.type];

/** Order notices open Đi chợ › Đơn hàng when tapped. */
export const opensOrders = (notice: NoticeLike): boolean => notice.data?.type === "order";
