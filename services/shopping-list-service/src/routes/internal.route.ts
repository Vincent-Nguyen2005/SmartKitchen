import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { PrismaClient } from "../../node_modules/.prisma/client-shopping-list";

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

/** How many shopping-list items (any family, bought or not) were added from this admin catalog product. */
export const productUsageHandler = (client: Pick<PrismaClient, "shoppingItem">): RequestHandler => async (req, res, next) => {
  try {
    const productId = String(req.params.productId ?? "").trim();
    if (!productId || productId.length > 64) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid product id" });
      return;
    }
    res.json({ items: await client.shoppingItem.count({ where: { productId } }) });
  } catch (error) {
    next(error);
  }
};

export const createInternalRouter = (client: Pick<PrismaClient, "shoppingItem">): Router => {
  const router = Router();
  router.use(requireInternalKey);
  router.get("/products/:productId/usage", productUsageHandler(client));
  return router;
};
