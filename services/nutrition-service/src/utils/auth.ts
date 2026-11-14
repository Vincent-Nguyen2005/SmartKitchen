import type { Request, Response } from "express";
import { z } from "zod";

export function getUserId(request: Request, response: Response): string | undefined {
  const userId = request.header("X-User-Id");
  if (!userId || !z.string().uuid().safeParse(userId).success) {
    response.status(401).json({ error: "A valid authenticated user is required." });
    return undefined;
  }
  return userId;
}
