import type { NextFunction, Request, Response } from "express";

/**
 * Small in-memory limiter (per signed-in user, else per IP) for guessable endpoints such as the family QR
 * verify / join: at most `limit` requests per `windowMs`; 429 with Retry-After beyond that.
 */
export function createRateLimit(options: { limit: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? Date.now;
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req as Request & { authUser?: { userId?: string } }).authUser?.userId ?? req.ip ?? "anonymous";
    const current = now();
    const recent = (hits.get(key) ?? []).filter((at) => current - at < options.windowMs);
    if (recent.length >= options.limit) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + options.windowMs - current) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ success: false, error: "Bạn thử quá nhiều lần, hãy đợi một lát rồi quét lại.", code: "RATE_LIMITED" });
      return;
    }
    recent.push(current);
    hits.set(key, recent);
    // Keep the map small: drop users whose window has passed.
    if (hits.size > 10_000) for (const [entry, times] of hits) if (times.every((at) => current - at >= options.windowMs)) hits.delete(entry);
    next();
  };
}
