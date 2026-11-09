import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type AuthenticatedPaymentRequest = Request & {
  authUser: { userId: string; token: string };
};

const developmentSecret = "development-only-secret";

function unauthorized(response: Response): void {
  response.status(401).json({ error: "Authentication required" });
}

export function requirePaymentUser(request: Request, response: Response, next: NextFunction): void {
  const token = request.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : developmentSecret);
  if (!token || !secret) {
    response.status(token ? 503 : 401).json({ error: token ? "Authentication is not configured" : "Authentication required" });
    return;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed access token");
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: unknown };
    if (header.alg !== "HS256") throw new Error("Unsupported access token algorithm");

    const expected = createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest();
    const received = Buffer.from(encodedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new Error("Invalid access token signature");
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
      nbf?: unknown;
    };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || payload.sub.length === 0 ||
      typeof payload.exp !== "number" || payload.exp <= now ||
      (typeof payload.nbf === "number" && payload.nbf > now)) {
      throw new Error("Expired or invalid access token");
    }

    (request as AuthenticatedPaymentRequest).authUser = { userId: payload.sub, token };
    next();
  } catch (error) {
    console.warn("[payment-service] rejected access token:", error);
    unauthorized(response);
  }
}
