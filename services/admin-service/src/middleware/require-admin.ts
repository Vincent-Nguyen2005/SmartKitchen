import type { Request, Response, NextFunction } from "express";

export const requireAdmin = (request: Request, response: Response, next: NextFunction): void => {
  // TODO: replace trusted gateway headers with Auth Service JWT verification.
  // This service must only be reachable through the internal gateway network.
  if (request.header("x-user-role") !== "ADMIN" || !request.header("x-user-id")) {
    response.status(403).json({ error: "FORBIDDEN", message: "Administrator role required" });
    return;
  }
  next();
};

export const adminUserId = (request: Request): string => request.header("x-user-id") || "unknown";
