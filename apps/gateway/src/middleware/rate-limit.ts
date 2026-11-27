import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { performanceConfig } from "../config/performance";
import { ALLOWED_ALGORITHMS } from "./authenticate";

/**
 * Rate limits (express-rate-limit, in memory, one window of RATE_LIMIT_WINDOW_MS):
 * - /api (global): a signed-in request counts for its USER (verified access token: `user:<sub>`), up to
 *   USER_RATE_LIMIT_MAX per window; anonymous requests count per IP, up to RATE_LIMIT_MAX. Keying by user matters
 *   because phones behind one Wi-Fi / NAT (and Docker Desktop's port forwarding) reach the gateway from ONE address:
 *   per IP, a family's devices shared a single small bucket.
 * - /api/auth: credential calls (login, register, OTP, password reset, refresh: every non-GET) per IP, up to
 *   AUTH_RATE_LIMIT_MAX; reading the profile (GET /api/auth/me) is not a credential attempt and is not counted here.
 * - Health checks are never limited.
 * - A limited request gets 429 { error: "RATE_LIMITED", retryAfterSeconds } and a Retry-After header with the
 *   seconds left in the window (the app waits that long, at most a few seconds, and retries once).
 */
const skipHealth = (request: Request): boolean =>
  request.path === "/health" || request.path === "/api/health";

type Limited = Request & { rateLimit?: { resetTime?: Date }; limitUser?: string | null };

/** The verified user id of the request's access token (cached on the request), or null. */
export const limitUserOf = (request: Request, secret: string | null): string | null => {
  const cached = (request as Limited).limitUser;
  if (cached !== undefined) return cached;
  let user: string | null = null;
  const authorization = request.header("authorization")?.trim() ?? "";
  if (secret && /^Bearer\s+\S/i.test(authorization)) {
    try {
      const payload = jwt.verify(authorization.replace(/^Bearer\s+/i, ""), secret, { algorithms: ALLOWED_ALGORITHMS });
      if (typeof payload !== "string" && typeof payload.sub === "string" && payload.sub) user = payload.sub;
    } catch {
      user = null;
    }
  }
  (request as Limited).limitUser = user;
  return user;
};

/** Seconds until the request's window resets (at least 1). */
export const retryAfterSeconds = (request: Request, now: number = Date.now()): number => {
  const reset = (request as Limited).rateLimit?.resetTime?.getTime();
  return reset ? Math.max(1, Math.ceil((reset - now) / 1000)) : Math.ceil(performanceConfig.rateLimitWindowMs / 1000);
};

const handler = (request: Request, response: Response): void => {
  const seconds = retryAfterSeconds(request);
  response.setHeader("Retry-After", String(seconds));
  response.status(429).json({ error: "RATE_LIMITED", retryAfterSeconds: seconds });
};

export const createGlobalRateLimiter = (secret: string | null = null) => rateLimit({
  windowMs: performanceConfig.rateLimitWindowMs,
  limit: (request: Request) => (limitUserOf(request, secret) ? performanceConfig.userRateLimitMax : performanceConfig.rateLimitMax),
  keyGenerator: (request: Request) => {
    const user = limitUserOf(request, secret);
    return user ? `user:${user}` : `ip:${request.ip ?? "unknown"}`;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipHealth,
  handler,
});

export const createAuthRateLimiter = () => rateLimit({
  windowMs: performanceConfig.rateLimitWindowMs,
  limit: performanceConfig.authRateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Only credential attempts count (GET /api/auth/me is a normal read).
  skip: (request: Request) => request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS",
  handler,
});
