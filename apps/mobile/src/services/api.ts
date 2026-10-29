const AUTH_BASE_URL = process.env.EXPO_PUBLIC_AUTH_API_URL ?? "http://localhost:4001/api/auth";
const FAMILY_BASE_URL = process.env.EXPO_PUBLIC_FAMILY_API_URL ?? "http://localhost:4002/api/family";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestOptions = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const request = async <T>(baseUrl: string, path: string, options: ApiRequestOptions = {}, accessToken?: string): Promise<T> => {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload.details);
  }
  return payload as T;
};

export const authApi = {
  login: (email: string, password: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/login", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ email, password }),
  }),
  register: (email: string, password: string, fullName?: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/register", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ email, password, fullName }),
  }),
  refresh: (refreshToken: string) => request<{ accessToken: string; user: AuthUser; refreshToken?: string }>(AUTH_BASE_URL, "/refresh", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ refreshToken }),
  }),
  logout: (accessToken: string, refreshToken: string) => request<void>(AUTH_BASE_URL, "/logout", {
    method: "POST", headers: { "X-Refresh-Token-Mode": "body" }, body: JSON.stringify({ refreshToken }),
  }, accessToken),
  me: (accessToken: string) => request<{ user: AuthUser }>(AUTH_BASE_URL, "/me", { method: "GET" }, accessToken),
};

export type AuthUser = { id: string; email: string; fullName: string | null; avatarUrl: string | null; role: string; isVerified: boolean };

export type ApiFamilyRole = "OWNER" | "ADMIN" | "MEMBER";
export type ApiFamilyMember = { id: string; userId: string; role: ApiFamilyRole; joinedAt: string; displayName?: string; email?: string };
export type ApiFamily = { id: string; name: string; code: string; codeExpiresAt: string; members: ApiFamilyMember[]; currentUserRole: ApiFamilyRole };

export const familyApi = {
  getMine: (token: string) => request<{ family: ApiFamily }>(FAMILY_BASE_URL, "/me", {}, token),
  create: (token: string, name: string) => request<{ family: ApiFamily }>(FAMILY_BASE_URL, "/", { method: "POST", body: JSON.stringify({ name }) }, token),
  join: (token: string, code: string) => request<{ membership: ApiFamilyMember }>(FAMILY_BASE_URL, "/join", { method: "POST", body: JSON.stringify({ code }) }, token),
  leave: (token: string) => request<void>(FAMILY_BASE_URL, "/me", { method: "DELETE" }, token),
  updateRole: (token: string, memberId: string, role: Exclude<ApiFamilyRole, "OWNER">) => request<{ member: ApiFamilyMember }>(FAMILY_BASE_URL, `/members/${encodeURIComponent(memberId)}/role`, { method: "PATCH", body: JSON.stringify({ role }) }, token),
  removeMember: (token: string, memberId: string) => request<void>(FAMILY_BASE_URL, `/members/${encodeURIComponent(memberId)}`, { method: "DELETE" }, token),
  regenerateJoinCode: (token: string) => request<{ joinCode: { id: string; code: string; codeExpiresAt: string } }>(FAMILY_BASE_URL, "/join-code/regenerate", { method: "POST" }, token),
  verifyInvitation: (accessToken: string, codeOrToken: string) => {
    const parameter = codeOrToken.length >= 16 ? "token" : "code";
    return request<{ invitation: { type: "invitation" | "join-code"; family: { id: string; name: string }; role?: ApiFamilyRole; expiresAt: string } }>(FAMILY_BASE_URL, `/invitations/verify?${parameter}=${encodeURIComponent(codeOrToken)}`, {}, accessToken);
  },
};
