import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const requireInternalKey = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.INTERNAL_API_KEY;
  const supplied = req.get("x-api-key") || "";
  if (!expected || expected.length < 32) {
    res.status(503).json({ error: "INTERNAL_NOT_CONFIGURED", message: "Internal API key is not configured" });
    return;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: "FORBIDDEN", message: "Invalid internal API key" });
    return;
  }
  next();
};
