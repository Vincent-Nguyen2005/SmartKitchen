/**
 * Access-token refresh shared by every API call (JSON, uploads, AuthImage downloads). Kept free of React Native imports
 * so the plain Node unit tests run it; services/api.ts owns the one coordinator and session.tsx configures it.
 *
 * - The current access token lives here, so a call made with an older token (captured in a screen's state) still
 *   sends the newest one.
 * - A 401 refreshes once and retries once. Concurrent 401s share a single refresh (the server rotates the refresh
 *   token, so two refreshes with the same token would make the second one fail and sign the user out).
 * - A refresh the server rejects (refresh token expired / revoked) ends the session once: `onExpired`.
 */

export const SESSION_EXPIRED_MESSAGE = "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại";

/** The refresh token is invalid (expired, revoked, already rotated): sign in again. Other errors are temporary. */
export class RefreshRejectedError extends Error {
  constructor(message = SESSION_EXPIRED_MESSAGE) {
    super(message);
    this.name = "RefreshRejectedError";
  }
}

export type AuthCoordinatorDeps = {
  /** One refresh with the stored refresh token; resolves the new access token. Throws RefreshRejectedError if rejected. */
  refresh: () => Promise<string>;
  /** Called once when a refresh is rejected (clear the session, show SESSION_EXPIRED_MESSAGE). */
  onExpired: () => void;
};

export type AuthCoordinator = {
  configure: (deps: AuthCoordinatorDeps | null) => void;
  setToken: (token: string | null) => void;
  current: () => string | null;
  /**
   * Single-flight refresh. With `stale` (the token that just got a 401): if the current token is already a different
   * one (refreshed meanwhile), that one is returned without asking the server again.
   */
  refresh: (stale?: string | null) => Promise<string>;
};

export function createAuthCoordinator(): AuthCoordinator {
  let token: string | null = null;
  let deps: AuthCoordinatorDeps | null = null;
  let inFlight: Promise<string> | null = null;
  return {
    configure: (next) => { deps = next; },
    setToken: (next) => { token = next; },
    current: () => token,
    refresh: (stale) => {
      if (stale && token && token !== stale) return Promise.resolve(token);
      if (inFlight) return inFlight;
      const own = deps;
      if (!own) return Promise.reject(new RefreshRejectedError());
      const run = own.refresh()
        .then((next) => { token = next; return next; })
        .catch((error: unknown) => {
          if (error instanceof RefreshRejectedError) {
            token = null;
            own.onExpired();
          }
          throw error;
        })
        .finally(() => { if (inFlight === run) inFlight = null; });
      inFlight = run;
      return run;
    },
  };
}

/**
 * Sends a request with the freshest token; on 401 refreshes (shared) and retries once. A rejected refresh returns
 * the original 401 response (the session is being closed by `onExpired`); a failed refresh for another reason (no
 * network) throws, like a failed request.
 */
export async function sendWithRefresh(
  coordinator: AuthCoordinator,
  send: (token: string | undefined) => Promise<Response>,
  callerToken?: string | null,
): Promise<Response> {
  const token = callerToken ? coordinator.current() ?? callerToken : undefined;
  const first = await send(token);
  if (first.status !== 401 || !token) return first;
  let fresh: string;
  try {
    fresh = await coordinator.refresh(token);
  } catch (error) {
    if (error instanceof RefreshRejectedError) return first;
    throw error;
  }
  return send(fresh);
}

const decodeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return typeof atob === "function" ? atob(base64) : "";
};

/** Expiry of a JWT access token in ms since epoch (read only, not verified), or null if it cannot be read. */
export function jwtExpiresAt(token: string | null | undefined): number | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const exp = (JSON.parse(decodeBase64Url(payload)) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Refresh this long before the access token expires (proactive refresh and app resume). */
export const REFRESH_LEAD_MS = 60_000;

/** Delay until the proactive refresh (0 = now: expired or about to); null when the expiry is unknown. */
export function refreshDelayMs(token: string | null | undefined, now: number, leadMs = REFRESH_LEAD_MS): number | null {
  const expiresAt = jwtExpiresAt(token);
  if (expiresAt === null) return null;
  return Math.max(0, expiresAt - leadMs - now);
}
