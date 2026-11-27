/**
 * Quản trị › "Đơn hàng" (pure; covered by adminOrders.test.ts): one live list of every order — status tags, card texts,
 * the order (last status change, newest first), merging a live refresh (changed cards move to the top and flash), when
 * to refresh, which admin actions an order allows and their confirm texts.
 */
import { formatVnd } from "../../services/format";

export type AdminOrderStatus = "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "FAILED";
export type AdminOrderSummary = {
  id: string; status: AdminOrderStatus; purchasedAt: string; receiverName: string | null; deliveryAddress: string | null; itemCount: number; total: number; discountAmount: number;
  /** When the status last changed (server: the row's updatedAt). */
  lastUpdatedAt: string;
  /** Set for SHIPPING / DELIVERED orders. */
  shipperName: string | null;
};
export type AdminOrderList = { items: AdminOrderSummary[]; page: number; limit: number; total: number; counts: Record<AdminOrderStatus, number> };
export type AdminOrderDetail = {
  id: string; status: AdminOrderStatus; purchasedAt: string;
  receiverName: string | null; receiverPhone: string | null; deliveryAddress: string | null; note: string | null;
  subtotal: number; promotionName: string | null; discountAmount: number; total: number; codAmount: number; itemCount: number; failReason: string | null;
  shipper: { name: string | null; phone: string | null } | null;
  timeline: Array<{ status: AdminOrderStatus; at: string }>;
  items: Array<{ id: string; name: string; quantity: number; unit: string; unitLabel: string | null; unitPrice: number | null; originalUnitPrice: number | null; lineTotal: number | null }>;
};

export type TagTone = "neutral" | "warning" | "success" | "danger";
/** The status tag at the top right of a card (and in the detail): label and colour tone. */
export const STATUS_TAGS: Record<AdminOrderStatus, { label: string; tone: TagTone }> = {
  PENDING: { label: "Chờ giao", tone: "neutral" },
  SHIPPING: { label: "Đang giao", tone: "warning" },
  DELIVERED: { label: "Đã giao", tone: "success" },
  CANCELLED: { label: "Đã hủy", tone: "danger" },
  FAILED: { label: "Không giao được", tone: "danger" },
};
export const statusLabel = (status: AdminOrderStatus): string => STATUS_TAGS[status]?.label ?? status;

/** "3 món" or "3 món · Người giao: Anh Tú" (SHIPPING / DELIVERED with a shipper). */
export const itemsLine = (order: Pick<AdminOrderSummary, "itemCount" | "status" | "shipperName">): string =>
  (order.status === "SHIPPING" || order.status === "DELIVERED") && order.shipperName ? `${order.itemCount} món · Người giao: ${order.shipperName}` : `${order.itemCount} món`;

const time = (iso: string): number => Date.parse(iso) || 0;
/** Last status change first; ties: newer purchase, then id (stable between refreshes). */
export const sortByLastChange = <T extends Pick<AdminOrderSummary, "id" | "lastUpdatedAt" | "purchasedAt">>(items: readonly T[]): T[] =>
  [...items].sort((first, second) => time(second.lastUpdatedAt) - time(first.lastUpdatedAt) || time(second.purchasedAt) - time(first.purchasedAt) || (second.id < first.id ? -1 : second.id > first.id ? 1 : 0));

/**
 * A live refresh (the newest window from the server) merged into the loaded list: fresh rows replace their old copy,
 * new orders are added, rows beyond the window stay, then the list is re-sorted. `changedIds` = orders whose status
 * changed (they move to the top and their tag flashes).
 */
export function mergeLive(current: readonly AdminOrderSummary[], fresh: readonly AdminOrderSummary[]): { items: AdminOrderSummary[]; changedIds: string[] } {
  const before = new Map(current.map((order) => [order.id, order]));
  const freshIds = new Set(fresh.map((order) => order.id));
  const changedIds = fresh.filter((order) => { const old = before.get(order.id); return old !== undefined && old.status !== order.status; }).map((order) => order.id);
  return { items: sortByLastChange([...fresh, ...current.filter((order) => !freshIds.has(order.id))]), changedIds };
}

export const LIVE_REFRESH_MS = 15_000;
/** A keystroke in the search box pauses the live refresh this long. */
export const TYPING_PAUSE_MS = 3_000;
/** Refresh now? Only while the page is open, the app in front, no detail sheet over it and the admin not typing. */
export const shouldRefreshNow = (state: { visible: boolean; appActive: boolean; sheetOpen: boolean; lastTypedAt: number; now: number }): boolean =>
  state.visible && state.appActive && !state.sheetOpen && state.now - state.lastTypedAt >= TYPING_PAUSE_MS;
/** How long a changed card's tag stays highlighted. */
export const HIGHLIGHT_MS = 900;

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
