import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from ".prisma/client-notification";
import { createApiKeyGuard } from "../middleware/api-key";

type InternalPrisma = Pick<PrismaClient, "notification">;

const internalNotificationSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  type: z.enum(["SYSTEM", "EXPIRY_ALERT", "SHOPPING_REMINDER"]).default("SYSTEM"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  data: z.record(z.unknown()).optional(),
});

/**
 * Service-to-service endpoints. Protected by INTERNAL_API_KEY (x-api-key) and additionally
 * hidden by the gateway, which answers 404 for /api/<service>/internal/*.
 */
export const createInternalRouter = (prisma: InternalPrisma): Router => {
  const router = Router();
  router.use(createApiKeyGuard("INTERNAL_API_KEY", "Invalid internal API key"));

  router.post("/notifications", async (request, response) => {
    const parsed = internalNotificationSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.flatten() });
    const now = new Date();
    // In-app notifications are delivered by being stored; the app lists them via GET /notifications.
    const notification = await prisma.notification.create({
      data: { ...parsed.data, data: parsed.data.data as object | undefined, channel: "IN_APP", status: "SENT", sentAt: now },
    });
    return response.status(201).json(notification);
  });

  return router;
};
