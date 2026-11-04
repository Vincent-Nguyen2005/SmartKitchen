import type { NextFunction, Request, Response } from "express";

/** Any authenticated caller: x-user-id is set by the gateway from a verified access token. */
export const requireUser = (request: Request, response: Response, next: NextFunction): void => {
  if (!request.header("x-user-id")) {
    response.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  next();
};

export const callerUserId = (request: Request): string => request.header("x-user-id") as string;
