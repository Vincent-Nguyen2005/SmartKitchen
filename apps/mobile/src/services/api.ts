import { Platform } from "react-native";
import { createAuthCoordinator, sendWithRefresh } from "./authSession";

// Expo web on port 8081 and the gateway run on the same host during local development.
const webDevGateway = Platform.OS === "web" && typeof window !== "undefined" && window.location.port === "8081"
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : undefined;
const gatewayBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  (Platform.OS === "web" ? process.env.EXPO_PUBLIC_WEB_API_BASE_URL?.trim() || webDevGateway : undefined) ||
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000")
).replace(/\/+$/, "");
/** Gateway origin shared by every screen API client (env, web dev host, then emulator default). */
export const GATEWAY_BASE_URL = gatewayBaseUrl;
/** Headers every gateway call needs: the free ngrok tunnel serves an HTML warning page (no CORS) without this one. */
export const gatewayHeaders = (): Record<string, string> =>
  gatewayBaseUrl.includes("ngrok") ? { "ngrok-skip-browser-warning": "1" } : {};
const AUTH_BASE_URL = `${gatewayBaseUrl}/api/auth`;
const FAMILY_BASE_URL = `${gatewayBaseUrl}/api/families`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestOptions = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

export type GatewayFetchInit = Omit<RequestInit, "headers" | "signal"> & {
  headers?: Record<string, string>;
  /**
   * Sent as `Authorization: Bearer …`; the gateway derives the user from it (client x-user-id is stripped). The
   * session's newest token is sent instead when it differs, and a 401 refreshes once and retries once.
   */
  accessToken?: string | null;
  timeoutMs?: number;
  /** Aborts the request (e.g. a newer search started); rejects with code ABORTED, not the network message. */
  signal?: AbortSignal;
};

/** The one access-token coordinator (configured by SessionProvider): newest token, single-flight refresh. */
export const authCoordinator = createAuthCoordinator();

export const NETWORK_ERROR_MESSAGE = "Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ gateway rồi thử lại.";

/**
 * The one transport every screen API client uses: gateway origin, ngrok header, Bearer token, JSON content type
 * for string bodies (FormData sets its own), a timeout, and one Vietnamese message when the network fails.
 * Callers keep their own response parsing, because each service shapes its JSON differently.
 */
export const gatewayFetch = async (path: string, init: GatewayFetchInit = {}): Promise<Response> => {
  const { accessToken, timeoutMs = 15_000, headers: extra, signal, ...rest } = init;
  const send = async (token: string | undefined): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json", ...gatewayHeaders(), ...extra };
    if (typeof rest.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      if (signal?.aborted) throw new ApiError("Aborted", 0, undefined, "ABORTED");
      return await fetch(`${gatewayBaseUrl}${path}`, { ...rest, headers, credentials: "omit", signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw new ApiError("Aborted", 0, undefined, "ABORTED");
      if (error instanceof ApiError) throw error;
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0, undefined, "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
  try {
    return await sendWithRefresh(authCoordinator, send, accessToken);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // The refresh itself could not reach the server.
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, undefined, "NETWORK_ERROR");
  }
};

const request = async <T>(baseUrl: string, path: string, options: ApiRequestOptions = {}, accessToken?: string): Promise<T> => {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (baseUrl.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "1";
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response: Response;
  try {
    // Mobile stores the refresh token returned in the response body; cross-origin cookies are not needed.
    response = await fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "omit" });
  } catch {
    throw new ApiError("Không kết nối được máy chủ. Vui lòng kiểm tra mạng và địa chỉ API.", 0, undefined, "NETWORK_ERROR");
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload.details, typeof payload.code === "string" ? payload.code : undefined);
  }
  if (payload.success === true && payload.data && typeof payload.data === "object") {
    return payload.data as T;
  }
  return payload as T;
};

export const authApi = {
  login: (email: string, password: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/login", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ email, password }),
  }),
  register: (email: string, password: string, fullName?: string) => request<{ email: string; verificationRequired: boolean; otpSent: boolean; retryAfterSeconds: number }>(AUTH_BASE_URL, "/register", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ email, password, fullName }),
  }),
  verifyOtp: (email: string, otpCode: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/verify-otp", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ email, otpCode }),
  }),
  resendOtp: (email: string) => request<{ email: string }>(AUTH_BASE_URL, "/resend-otp", {
    method: "POST", body: JSON.stringify({ email }),
  }),
  requestPasswordReset: (email: string) => request<{ message: string }>(AUTH_BASE_URL, "/password-reset/request", {
    method: "POST", body: JSON.stringify({ email }),
  }),
  verifyPasswordResetCode: (email: string, code: string) => request<{ verified: boolean }>(AUTH_BASE_URL, "/password-reset/verify", {
    method: "POST", body: JSON.stringify({ email, code }),
  }),
  confirmPasswordReset: (email: string, code: string, newPassword: string) => request<{ message: string }>(AUTH_BASE_URL, "/password-reset/confirm", {
    method: "POST", body: JSON.stringify({ email, code, newPassword }),
  }),
  refresh: (refreshToken: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/refresh", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ refreshToken }),
  }),
  logout: (accessToken: string, refreshToken: string) => request<void>(AUTH_BASE_URL, "/logout", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ refreshToken }),
  }, accessToken),
  me: (accessToken: string) => request<{ user: AuthUser }>(AUTH_BASE_URL, "/me", { method: "GET" }, accessToken),
  /** Hồ sơ: display name (1-50 characters) and/or avatar (an URL from inventoryApi.uploadAvatar, or null). */
  updateMe: (accessToken: string, changes: { fullName?: string; avatarUrl?: string | null }) =>
    request<{ user: AuthUser }>(AUTH_BASE_URL, "/me", { method: "PATCH", body: JSON.stringify(changes) }, accessToken),
};

export type AuthUser = { id: string; email: string; fullName: string | null; avatarUrl: string | null; role: string; isVerified: boolean };

/** POST /families/qr: the token (as QR text) lives while the owner's sheet is open, 10 minutes at most. */
export type FamilyQr = { token: string; payload: string; expiresAt: string; family: { id: string; name: string } };

export type ApiFamilyRole = "OWNER" | "ADMIN" | "MEMBER";
export type ApiFamilyMember = { id: string; userId: string; role: ApiFamilyRole; joinedAt: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null };
export type ApiFamily = { id: string; name: string; code: string; codeExpiresAt: string; members: ApiFamilyMember[]; currentUserRole: ApiFamilyRole };
export type ApiFamilySettings = {
  id: string;
  familyId: string;
  defaultDietaryRestrictions: string[];
  currency: string;
  monthlyBudget: number | null;
  householdRules: string[];
  createdAt: string;
  updatedAt: string;
};

export const familyApi = {
  getMine: (token: string) => request<{ family: ApiFamily }>(FAMILY_BASE_URL, "/me", {}, token),
  create: (token: string, name: string) => request<{ family: ApiFamily }>(FAMILY_BASE_URL, "/", { method: "POST", body: JSON.stringify({ name }) }, token),
  join: (token: string, code: string) => request<{ membership: ApiFamilyMember }>(FAMILY_BASE_URL, "/join", { method: "POST", body: JSON.stringify({ code }) }, token),
  /** "QR gia đình" (owner): a fresh one-time join QR; the previous one stops working. */
  createQr: (token: string) => request<FamilyQr>(FAMILY_BASE_URL, "/qr", { method: "POST" }, token),
  /** Owner closed the QR sheet: that token stops working now. */
  revokeQr: (token: string, qrToken?: string) => request<{ revoked: boolean }>(FAMILY_BASE_URL, "/qr/revoke", { method: "POST", body: JSON.stringify(qrToken ? { token: qrToken } : {}) }, token),
  /** Scanned family QR: the family's name and whether the user is already in it / in another family. */
  verifyQr: (token: string, scanned: string) => request<{ family: { id: string; name: string }; membership: "none" | "this" | "other" }>(FAMILY_BASE_URL, "/qr/verify", { method: "POST", body: JSON.stringify({ token: scanned }) }, token),
  joinQr: (token: string, scanned: string) => request<{ membership: ApiFamilyMember; family: { id: string; name: string } }>(FAMILY_BASE_URL, "/qr/join", { method: "POST", body: JSON.stringify({ token: scanned }) }, token),
  leave: (token: string) => request<void>(FAMILY_BASE_URL, "/me", { method: "DELETE" }, token),
  removeMember: (token: string, memberId: string) => request<void>(FAMILY_BASE_URL, `/members/${encodeURIComponent(memberId)}`, { method: "DELETE" }, token),
  regenerateJoinCode: (token: string) => request<{ joinCode: { id: string; code: string; codeExpiresAt: string } }>(FAMILY_BASE_URL, "/join-code/regenerate", { method: "POST" }, token),
  getSettings: (token: string) => request<{ settings: ApiFamilySettings }>(FAMILY_BASE_URL, "/settings", {}, token),
  updateSettings: (token: string, settings: Partial<Omit<ApiFamilySettings, "id" | "familyId" | "createdAt" | "updatedAt">>) =>
    request<{ settings: ApiFamilySettings }>(FAMILY_BASE_URL, "/settings", { method: "PATCH", body: JSON.stringify(settings) }, token),
  transferOwnership: (token: string, memberId: string) =>
    request<{ member: ApiFamilyMember }>(FAMILY_BASE_URL, "/transfer-ownership", { method: "POST", body: JSON.stringify({ memberId }) }, token),
  verifyInvitation: (accessToken: string, codeOrToken: string) => {
    const parameter = codeOrToken.length >= 16 ? "token" : "code";
    return request<{ invitation: { type: "invitation" | "join-code"; family: { id: string; name: string }; role?: ApiFamilyRole; expiresAt: string } }>(FAMILY_BASE_URL, `/invitations/verify?${parameter}=${encodeURIComponent(codeOrToken)}`, {}, accessToken);
  },
};
