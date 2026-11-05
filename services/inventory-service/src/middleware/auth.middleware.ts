import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type InventoryAuthRequest = Request & {
  authUser: { userId: string; token: string };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requireInventoryUser = (req: Request, res: Response, next: NextFunction): void => {
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
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown; nbf?: unknown };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || !uuidPattern.test(payload.sub) ||
      (typeof payload.exp !== "number" || payload.exp <= now) ||
      (typeof payload.nbf === "number" && payload.nbf > now)) throw new Error("Expired or invalid token");
    (req as InventoryAuthRequest).authUser = { userId: payload.sub, token };
    next();
  } catch {
    res.status(401).json({ success: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }
};
