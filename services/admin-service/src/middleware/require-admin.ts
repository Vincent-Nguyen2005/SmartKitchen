import type { Request, Response, NextFunction } from "express";

export const requireAdmin = (request: Request, response: Response, next: NextFunction): void => {
  // TODO: replace trusted gateway headers with Auth Service JWT verification.
  // This service must only be reachable through the internal gateway network.
  // The gateway forwards anonymous calls with neither header, so that case is unauthenticated (401),
  // while an identified caller without the ADMIN role is forbidden (403).
  const hasToken = Boolean(request.header("authorization")?.trim()) || Boolean(request.header("x-user-id"));
  if (!hasToken) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (request.header("x-user-role") !== "ADMIN" || !request.header("x-user-id")) {
    response.status(403).json({ error: "FORBIDDEN", message: "Administrator role required" });
    return;
  }
  next();
};

export const adminUserId = (request: Request): string => request.header("x-user-id") || "unknown";
