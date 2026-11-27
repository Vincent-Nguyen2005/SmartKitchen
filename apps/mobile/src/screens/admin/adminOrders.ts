/**
 * Quản trị › "Đơn hàng" (pure; covered by adminOrders.test.ts): status tabs with counts, card texts, which admin
 * actions an order allows and their confirm texts. Status colours reuse the customer Đơn hàng (shopping-cart/orders.ts).
 */
import { formatVnd } from "../../services/format";

export type AdminOrderStatus = "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "FAILED";
export type AdminOrderSummary = { id: string; status: AdminOrderStatus; purchasedAt: string; receiverName: string | null; deliveryAddress: string | null; itemCount: number; total: number; discountAmount: number };
export type AdminOrderList = { items: AdminOrderSummary[]; page: number; limit: number; total: number; counts: Record<AdminOrderStatus, number> };
export type AdminOrderDetail = {
  id: string; status: AdminOrderStatus; purchasedAt: string;
  receiverName: string | null; receiverPhone: string | null; deliveryAddress: string | null; note: string | null;
  subtotal: number; promotionName: string | null; discountAmount: number; total: number; codAmount: number; itemCount: number; failReason: string | null;
  shipper: { name: string | null; phone: string | null } | null;
  timeline: Array<{ status: AdminOrderStatus; at: string }>;
  items: Array<{ id: string; name: string; quantity: number; unit: string; unitLabel: string | null; unitPrice: number | null; originalUnitPrice: number | null; lineTotal: number | null }>;
};

/** The admin's words for each status (the tabs). */
export const ADMIN_STATUS_TABS: ReadonlyArray<{ key: AdminOrderStatus; label: string }> = [
  { key: "PENDING", label: "Chờ giao" },
  { key: "SHIPPING", label: "Đang giao" },
  { key: "DELIVERED", label: "Đã giao" },
  { key: "CANCELLED", label: "Đã hủy" },
  { key: "FAILED", label: "Không giao được" },
];
export const statusLabel = (status: AdminOrderStatus): string => ADMIN_STATUS_TABS.find((tab) => tab.key === status)?.label ?? status;
/** "Chờ giao (3)". */
export const tabLabel = (tab: { key: AdminOrderStatus; label: string }, counts: Partial<Record<AdminOrderStatus, number>> | null): string =>
  counts ? `${tab.label} (${counts[tab.key] ?? 0})` : tab.label;

/** First part of the address ("12 Lê Lợi, Quận 1, TP. HCM" → "12 Lê Lợi, Quận 1"). */
export const shortAddress = (address: string | null): string => {
  if (!address) return "Chưa có địa chỉ";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ") || address;
};

/** Screen-reader line for a card. */
export const orderCardLabel = (order: AdminOrderSummary, time: string): string =>
  `${statusLabel(order.status)}, ${time}, ${order.receiverName ?? "Không rõ người nhận"}, ${shortAddress(order.deliveryAddress)}, ${order.itemCount} món, ${formatVnd(order.total).replace("đ", " đồng")}`;

export const canCancel = (status: AdminOrderStatus): boolean => status === "PENDING";
export const canUnassign = (status: AdminOrderStatus): boolean => status === "SHIPPING";

export const cancelConfirm = (total: number) => ({
  title: "Hủy đơn hàng này?", message: `Đơn ${formatVnd(total)} sẽ bị hủy, các món "Đang giao" được bỏ khỏi Kho và khách nhận thông báo.`, confirmLabel: "Hủy đơn", cancelLabel: "Giữ đơn", destructive: true,
});
export const unassignConfirm = (shipperName: string | null) => ({
  title: "Gỡ người giao?", message: `${shipperName ?? "Người giao"} sẽ không còn nhận đơn này; đơn quay lại hàng chờ để người khác nhận.`, confirmLabel: "Gỡ người giao", cancelLabel: "Không", destructive: true,
});
