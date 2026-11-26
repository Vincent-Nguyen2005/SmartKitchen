import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { breakfastToday } from "../services/breakfast-today";
import { FamilyLookupError, type MembershipLookup } from "../services/family-client";

/** Service-to-service only: x-api-key = INTERNAL_API_KEY. The gateway answers 404 for /internal/*. */
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

type UsageClient = Pick<PrismaClient, "menuItem" | "removedDish">;
type InternalClient = UsageClient & Pick<PrismaClient, "menu">;

/**
 * Before recipe-service deletes a dish: how many saved menu items (any family, past or future) and dislike-history
 * rows point at the recipe id. Saved AI dishes keep their own copy of the dish (no recipe id), so they never block.
 */
export const recipeUsageHandler = (client: UsageClient): RequestHandler => async (req, res, next) => {
  try {
    const recipeId = String(req.params.recipeId ?? "").trim();
    if (!recipeId || recipeId.length > 64) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid recipe id" });
      return;
    }
    const [menuItems, removedDishes] = await Promise.all([
      client.menuItem.count({ where: { recipeId } }),
      client.removedDish.count({ where: { recipeId } }),
    ]);
    res.json({ menuItems, removedDishes });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /internal/breakfast-today { userIds: string[] (1-500) } -> { day, items: [{ userId, dishes: string[] }] }:
 * today's (Vietnam day) family breakfast dish names, for notification-service's 07:00 morning push. Users without a
 * family are left out. 400 for a bad body, 503 when family-service cannot answer.
 */
export const breakfastTodayHandler = (client: Pick<PrismaClient, "menu">, lookup?: MembershipLookup): RequestHandler => async (req, res, next) => {
  const userIds = (req.body as { userIds?: unknown } | undefined)?.userIds;
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 500 || !userIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) {
    res.status(400).json({ error: "VALIDATION_ERROR", message: "userIds must be 1-500 ids" });
    return;
  }
  try {
    res.json(await breakfastToday(userIds as string[], client, { lookup }));
  } catch (error) {
    if (error instanceof FamilyLookupError) {
      res.status(503).json({ error: "FAMILY_UNAVAILABLE", message: "Family lookup is unavailable" });
      return;
    }
    next(error);
  }
};

export const createInternalRouter = (client: InternalClient): Router => {
  const router = Router();
  router.use(requireInternalKey);
  router.get("/recipes/:recipeId/usage", recipeUsageHandler(client));
  router.post("/breakfast-today", breakfastTodayHandler(client));
  return router;
};
