import type { NextFunction, Request, Response } from "express";

/**
 * Caller identity, set ONLY by the gateway from a verified access token (it strips any
 * client-supplied x-user-id / x-user-role first). This service is reachable solely through
 * the gateway / private network, so these headers are trusted here and nowhere else.
 */
export const callerUserId = (request: Request): string => request.header("x-user-id")?.trim() ?? "";
export const callerIsAdmin = (request: Request): boolean => request.header("x-user-role") === "ADMIN";

export const requireUser = (request: Request, response: Response, next: NextFunction): void => {
  if (!callerUserId(request)) {
    response.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  next();
};

export const requireAdmin = (request: Request, response: Response, next: NextFunction): void => {
  if (!callerUserId(request)) {
    response.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  if (!callerIsAdmin(request)) {
    response.status(403).json({ error: "FORBIDDEN", message: "Administrator role required" });
    return;
  }
  next();
};

/**
 * Legacy clients may still name a user (query/body/path). It is never used as identity:
 * it must match the caller, otherwise 403. No admin override: no admin use case reads
 * another user's inbox, preferences or tokens.
 */
export const namesOtherUser = (request: Request, named: unknown): boolean =>
  named !== undefined && named !== null && named !== "" && String(named) !== callerUserId(request);

export const forbidOtherUser = (response: Response): void => {
  response.status(403).json({ error: "FORBIDDEN", message: "You can only access your own notifications" });
};
