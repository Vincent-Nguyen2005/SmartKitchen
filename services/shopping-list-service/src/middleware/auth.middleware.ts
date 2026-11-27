import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** role: the platform role in the verified token (USER, ADMIN, SHIPPER); shipper endpoints need SHIPPER. */
export type ShoppingAuthRequest = Request & { authUser: { userId: string; token: string; role?: string } };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requireShoppingUser = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "development-only-secret");
  if (!token || !secret) {
    res.status(token ? 503 : 401).json({ success: false, error: token ? "AUTH_NOT_CONFIGURED" : "AUTHENTICATION_REQUIRED" });
    return;
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed token");
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") throw new Error("Unsupported token algorithm");
    const expected = createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest();
    const received = Buffer.from(encodedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid token signature");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; nbf?: unknown; role?: unknown };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || !uuidPattern.test(payload.sub) ||
      (typeof payload.exp !== "number" || payload.exp <= now) ||
      (typeof payload.nbf === "number" && payload.nbf > now)) throw new Error("Expired or invalid token");
    (req as ShoppingAuthRequest).authUser = { userId: payload.sub, token, ...(typeof payload.role === "string" ? { role: payload.role } : {}) };
    next();
  } catch {
    res.status(401).json({ success: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }
};

/** Shipper endpoints: the verified token must carry the SHIPPER role (403 otherwise). */
export const requireShipper = (req: Request, res: Response, next: NextFunction): void => {
  if ((req as ShoppingAuthRequest).authUser?.role !== "SHIPPER") {
    res.status(403).json({ success: false, code: "SHIPPER_ONLY", message: "Only shipper accounts can do this." });
    return;
  }
  next();
};

/** Shipper accounts checked recently (30 s), so a disabled account is refused quickly without asking on every call. */
const activeCache = new Map<string, { active: boolean; at: number }>();
const ACTIVE_TTL_MS = 30_000;
export const clearShipperCache = (): void => activeCache.clear();

/**
 * After requireShipper: the account must still be active in auth-service (an admin may have disabled it after the
 * token was issued). 403 SHIPPER_DISABLED when disabled; 503 when auth-service cannot answer.
 */
export const requireActiveShipper = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = (req as ShoppingAuthRequest).authUser.userId;
  const cached = activeCache.get(userId);
  let active = cached && Date.now() - cached.at < ACTIVE_TTL_MS ? cached.active : null;
  if (active === null) {
    const key = process.env.INTERNAL_API_KEY;
    const base = (process.env.AUTH_SERVICE_URL || (process.env.NODE_ENV === "production" ? "http://auth-service:4001" : "http://localhost:4001")).replace(/\/+$/, "");
    try {
      const response = await fetch(`${base}/internal/shippers/${encodeURIComponent(userId)}/status`, { headers: { "x-api-key": key ?? "" }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`auth-service answered ${response.status}`);
      active = ((await response.json()) as { active?: unknown }).active === true;
      activeCache.set(userId, { active, at: Date.now() });
    } catch {
      res.status(503).json({ success: false, code: "AUTH_UNAVAILABLE", message: "Could not check the shipper account." });
      return;
    }
  }
  if (!active) {
    res.status(403).json({ success: false, code: "SHIPPER_DISABLED", message: "Tài khoản người giao hàng đã bị khóa." });
    return;
  }
  next();
};
