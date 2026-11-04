import { Platform } from "react-native";

/**
 * Small API client for the notification and admin screens (owner: Huy).
 * All calls go through the gateway, which verifies the access token and sets the trusted
 * x-user-id / x-user-role headers for notification-service and admin-service.
 * Base URL: EXPO_PUBLIC_API_BASE_URL — the same gateway variable and fallback App.tsx uses.
 * No secrets live in the app: the only credential is the user's access token from useSession().
 */
export const GATEWAY_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 10_000;

export class GatewayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GatewayApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type GatewayClient = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
};

/** Human-readable Vietnamese message for an error thrown by the client. */
export const errorMessage = (error: unknown): string => {
  if (error instanceof GatewayApiError) {
    if (error.status === 0) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
    if (error.status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
};

export const createGatewayClient = (accessToken: string | null, timeoutMs = DEFAULT_TIMEOUT_MS): GatewayClient => {
  const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let response: Response;
    try {
      response = await fetch(`${GATEWAY_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new GatewayApiError("Network error or timeout", 0, "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof payload.error === "string" ? payload.error : `HTTP_${response.status}`;
      const message = typeof payload.message === "string" ? payload.message : code;
      throw new GatewayApiError(message, response.status, code, payload.details ?? payload);
    }
    return payload as T;
  };

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    put: (path, body) => request("PUT", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
  };
};

export const query = (params: Record<string, string | number | boolean | undefined | null>): string => {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
};

export type Page<T> = { items: T[]; page: number; limit: number; total: number };
