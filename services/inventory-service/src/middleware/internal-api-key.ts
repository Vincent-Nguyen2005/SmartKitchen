import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const requireInternalApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.PURCHASE_SYNC_API_KEY || (process.env.NODE_ENV === "production" ? "" : "dev-only-purchase-sync-key-change-me");
  const received = req.header("x-internal-api-key") || "";
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (!expected || expectedBytes.length !== receivedBytes.length || !timingSafeEqual(expectedBytes, receivedBytes)) {
    res.status(expected ? 401 : 503).json({ success: false, error: expected ? "INTERNAL_AUTHENTICATION_REQUIRED" : "INTERNAL_AUTH_NOT_CONFIGURED" });
    return;
  }
  next();
};
