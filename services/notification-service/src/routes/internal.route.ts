import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from ".prisma/client-notification";
import { createApiKeyGuard } from "../middleware/api-key";
import { normalizedKeywords } from "../lib/promotion";

type InternalPrisma = Pick<PrismaClient, "notification" | "promotion" | "partnerSupermarket">;

const internalNotificationSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  type: z.enum(["SYSTEM", "EXPIRY_ALERT", "SHOPPING_REMINDER"]).default("SYSTEM"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  data: z.record(z.unknown()).optional(),
  /** Optional idempotency key (e.g. "order:<id>:DELIVERED"): a second call with the same key adds no row. */
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});

const externalIdSchema = z.string().trim().min(1).max(200);
const httpsUrl = z.string().trim().url().max(2048).refine((value) => value.startsWith("https://"), "Must be an https URL");
// Upsert payload for a promotion owned by another service (admin-service ingredients today).
const syncedPromotionSchema = z.object({
  partnerName: z.string().trim().min(1).max(200).default("SmartKitchen"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  discountInfo: z.string().trim().max(200).nullable().optional(),
  productKeywords: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  imageUrl: httpsUrl.nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
}).refine((value) => value.startsAt <= value.endsAt, { message: "startsAt must be before endsAt", path: ["endsAt"] });

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
    if (parsed.data.dedupeKey) {
      const existing = await prisma.notification.findUnique({ where: { dedupeKey: parsed.data.dedupeKey } });
      if (existing) return response.status(200).json(existing);
    }
    // In-app notifications are delivered by being stored; the app lists them via GET /notifications.
    try {
      const notification = await prisma.notification.create({
        data: { ...parsed.data, data: parsed.data.data as object | undefined, channel: "IN_APP", status: "SENT", sentAt: now },
      });
      return response.status(201).json(notification);
    } catch (error) {
      // A parallel call with the same key won: answer that row.
      if ((error as { code?: string }).code === "P2002" && parsed.data.dedupeKey) {
        return response.status(200).json(await prisma.notification.findUnique({ where: { dedupeKey: parsed.data.dedupeKey } }));
      }
      throw error;
    }
  });

  // Create or update the promotion identified by externalId (idempotent) and make it active.
  // The partner (default "SmartKitchen") is created on first use.
  router.put("/promotions/:externalId", async (request, response) => {
    const externalId = externalIdSchema.safeParse(request.params.externalId);
    const parsed = syncedPromotionSchema.safeParse(request.body);
    if (!externalId.success || !parsed.success) {
      return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: parsed.success ? externalId.error?.flatten() : parsed.error.flatten() });
    }
    const { partnerName, ...fields } = parsed.data;
    const partner = await prisma.partnerSupermarket.findFirst({ where: { name: partnerName } })
      ?? await prisma.partnerSupermarket.create({ data: { name: partnerName } });
    const data = {
      ...fields,
      description: fields.description ?? null,
      discountInfo: fields.discountInfo ?? null,
      imageUrl: fields.imageUrl ?? null,
      productKeywords: normalizedKeywords(fields.productKeywords),
      partnerId: partner.id,
      isActive: true,
    };
    const promotion = await prisma.promotion.upsert({ where: { externalId: externalId.data }, update: data, create: { ...data, externalId: externalId.data } });
    return response.json(promotion);
  });

  // Deactivate (never delete) the promotion for externalId; unknown ids are a no-op.
  router.post("/promotions/:externalId/deactivate", async (request, response) => {
    const externalId = externalIdSchema.safeParse(request.params.externalId);
    if (!externalId.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: externalId.error.flatten() });
    const result = await prisma.promotion.updateMany({ where: { externalId: externalId.data }, data: { isActive: false } });
    return response.json({ deactivated: result.count });
  });

  // Before admin-service deletes an ingredient: does its promotion exist, is it running, were users notified?
  router.get("/promotions/:externalId/usage", async (request, response) => {
    const externalId = externalIdSchema.safeParse(request.params.externalId);
    if (!externalId.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: externalId.error.flatten() });
    const promotion = await prisma.promotion.findUnique({ where: { externalId: externalId.data } });
    if (!promotion) return response.json({ exists: false, active: false, notified: 0 });
    const now = new Date();
    const notified = await prisma.notification.count({ where: { type: "PROMOTION", data: { path: ["promotionId"], equals: promotion.id } } });
    return response.json({ exists: true, active: promotion.isActive && promotion.startsAt <= now && promotion.endsAt >= now, notified });
  });

  // Hard delete of a synced promotion (its ingredient is being deleted and nobody was notified); unknown ids are a no-op.
  router.delete("/promotions/:externalId", async (request, response) => {
    const externalId = externalIdSchema.safeParse(request.params.externalId);
    if (!externalId.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: externalId.error.flatten() });
    const result = await prisma.promotion.deleteMany({ where: { externalId: externalId.data } });
    return response.json({ deleted: result.count });
  });

  return router;
};
