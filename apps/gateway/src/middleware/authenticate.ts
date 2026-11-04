import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

/**
 * Matches services/auth-service/src/services/auth.service.ts:
 *   jwt.sign({ email, role }, JWT_SECRET, { subject: user.id, expiresIn: "15m" })
 * -> HS256 (jsonwebtoken default for a string secret), user id in `sub`,
 *    role in `role` (USER | ADMIN), no iss/aud. Refresh tokens are opaque, not JWTs.
 */
export const ALLOWED_ALGORITHMS: jwt.Algorithm[] = ["HS256"];
export const KNOWN_ROLES = ["USER", "ADMIN"] as const;
const DEV_FALLBACK_SECRET = "development-only-secret"; // same fallback as auth-service, never used in production

export const IDENTITY_HEADERS = ["x-user-id", "x-user-role"] as const;

export const resolveJwtSecret = (env: NodeJS.ProcessEnv = process.env): string | null => {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  return env.NODE_ENV === "production" ? null : DEV_FALLBACK_SECRET;
};

/** Routes where an invalid/expired token must never cause a 401 (login, refresh, health). */
export const isAuthExempt = (path: string): boolean =>
  path === "/health" || path === "/api/health" || path === "/api/auth" || path.startsWith("/api/auth/");

const unauthorized = (response: Response, message: string): void => {
  response.status(401).json({ error: "UNAUTHORIZED", message });
};

export const createAuthenticate = (secret: string | null = resolveJwtSecret()) =>
  (request: Request, response: Response, next: NextFunction): void => {
    // 1. Never trust identity headers supplied by the client.
    for (const header of IDENTITY_HEADERS) delete request.headers[header];

    // 2. Authorization is forwarded upstream unchanged; we only read it.
    const authorization = request.header("authorization");
    if (isAuthExempt(request.path)) { next(); return; }
    if (!authorization || !/^Bearer(\s|$)/i.test(authorization.trim())) { next(); return; } // anonymous / other schemes

    const token = authorization.trim().replace(/^Bearer\s*/i, "").trim();
    if (!token || !secret) { unauthorized(response, "Invalid access token"); return; }

    let payload: JwtPayload | string;
    try {
      payload = jwt.verify(token, secret, { algorithms: ALLOWED_ALGORITHMS });
    } catch (error) {
      unauthorized(response, error instanceof jwt.TokenExpiredError ? "Access token expired" : "Invalid access token");
      return;
    }
    if (typeof payload === "string" || typeof payload.sub !== "string" || payload.sub.length === 0) {
      unauthorized(response, "Invalid access token");
      return;
    }

    // 3. Identity comes only from the verified token.
    request.headers["x-user-id"] = payload.sub;
    const role = typeof payload.role === "string" ? payload.role : undefined;
    if (role && (KNOWN_ROLES as readonly string[]).includes(role)) request.headers["x-user-role"] = role;
    next();
  };
