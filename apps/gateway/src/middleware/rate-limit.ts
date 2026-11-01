import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { performanceConfig } from "../config/performance";

const skipHealth = (request: Request): boolean =>
  request.path === "/health" || request.path === "/api/health";

const handler = (_request: Request, response: { status: (code: number) => { json: (body: unknown) => void } }, _next: unknown, options: { windowMs: number }): void => {
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
  response.status(429).json({ error: "RATE_LIMITED", retryAfterSeconds });
};

export const createGlobalRateLimiter = () => rateLimit({
  windowMs: performanceConfig.rateLimitWindowMs,
  limit: performanceConfig.rateLimitMax,
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
  handler,
});
