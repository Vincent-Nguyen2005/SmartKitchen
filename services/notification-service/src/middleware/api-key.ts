import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Constant-time comparison. Both sides are hashed first so the comparison takes the same
 * time regardless of the supplied key's length. An empty/unset expected key never matches.
 */
export const apiKeyMatches = (actual: string | undefined, expected: string | undefined): boolean => {
  if (!expected) return false;
  return timingSafeEqual(digest(actual ?? ""), digest(expected));
};

export const createApiKeyGuard = (envName: string, message: string) =>
  (request: Request, response: Response, next: NextFunction): void => {
    if (!apiKeyMatches(request.header("x-api-key"), process.env[envName])) {
      response.status(401).json({ error: "UNAUTHORIZED", message });
      return;
    }
    next();
  };
