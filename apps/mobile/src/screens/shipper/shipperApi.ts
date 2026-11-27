import { createGatewayClient, GatewayApiError } from "../notifications/gatewayApi";
import type { ShipperOrder, ShipperScope } from "./shipper";

/** shopping-list-service shipper API (SHIPPER role + active account; the server checks both). */
type Origin = { latitude: number; longitude: number } | null;
const at = (origin: Origin) => (origin ? `lat=${origin.latitude.toFixed(5)}&lng=${origin.longitude.toFixed(5)}` : "");

export const shipperApi = (accessToken: string | null) => {
  const api = createGatewayClient(accessToken);
  return {
    list: async (scope: ShipperScope, origin: Origin): Promise<ShipperOrder[]> =>
      (await api.get<{ data: { items: ShipperOrder[] } }>(`/api/shopping-list/shipper/orders?scope=${scope}${origin ? `&${at(origin)}` : ""}`)).data.items,
    detail: async (id: string, origin: Origin): Promise<ShipperOrder> =>
      (await api.get<{ data: { order: ShipperOrder } }>(`/api/shopping-list/shipper/orders/${encodeURIComponent(id)}${origin ? `?${at(origin)}` : ""}`)).data.order,
    accept: async (id: string) => (await api.post<{ data: { order: ShipperOrder } }>(`/api/shopping-list/shipper/orders/${encodeURIComponent(id)}/accept`)).data.order,
    deliver: async (id: string) => (await api.post<{ data: { order: ShipperOrder } }>(`/api/shopping-list/shipper/orders/${encodeURIComponent(id)}/deliver`)).data.order,
    fail: async (id: string, reason: string) => (await api.post<{ data: { order: ShipperOrder } }>(`/api/shopping-list/shipper/orders/${encodeURIComponent(id)}/fail`, { reason })).data.order,
  };
};

/** Vietnamese message for a shipper action error. */
export const shipperErrorText = (error: unknown, action: "accept" | "deliver" | "fail" | "load"): string => {
  if (error instanceof GatewayApiError) {
    if (error.status === 409 && action === "accept") return "Đơn đã có người nhận.";
    if (error.status === 409) return "Đơn đã thay đổi trạng thái. Kéo xuống để tải lại.";
    if (error.status === 403) return "Tài khoản người giao hàng đã bị khóa hoặc không có quyền.";
    if (error.status === 404) return "Không tìm thấy đơn hàng.";
    if (error.status === 0) return "Không kết nối được máy chủ. Kiểm tra mạng.";
    if (error.status >= 500) return "Máy chủ đang gặp sự cố. Thử lại sau.";
    return error.message;
  }
  return "Đã xảy ra lỗi. Thử lại.";
};
