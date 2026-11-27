import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { keywordsOverlap, normalizedKeywords } from "../lib/promotion";
import { dispatchPromotion, ensureActivePromotionRows, promotionDismissalKey } from "../services/promotion-dispatch.service";
import { createApiKeyGuard } from "../middleware/api-key";
import { callerUserId, forbidOtherUser, namesOtherUser, requireAdmin, requireUser } from "../middleware/identity";

const router = Router();
/** Week and expiry dismissals are kept this long (their keys name a week / day that is long past by then). */
const DISMISSAL_KEEP_DAYS = 60;
const apiKeyGuard = createApiKeyGuard("PARTNER_API_KEY", "Invalid partner API key");
const error = (response: { status: (code: number) => { json: (body: unknown) => void } }, details: unknown): void => response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details });
const page = (value: unknown, fallback: number, max: number): number => Math.min(Math.max(Number(value) || fallback, 1), max);
const promotionSchema = z.object({ title: z.string().min(1), description: z.string().optional(), discountInfo: z.string().optional(), productKeywords: z.array(z.string()), imageUrl: z.string().url().optional(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), isActive: z.boolean().optional() });

// User routes: identity comes only from the gateway's x-user-id (see middleware/identity.ts).
// A userId still sent by a client must match the caller (403 otherwise) and is never trusted.
router.post("/device-tokens", requireUser, async (request, response) => {
  const parsed = z.object({ userId: z.string().min(1).optional(), token: z.string().min(1), platform: z.enum(["IOS", "ANDROID"]) }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  if (namesOtherUser(request, parsed.data.userId)) return forbidOtherUser(response);
  // A push token identifies a physical device; when another account signs in on it, the token moves to that account.
  const data = { userId: callerUserId(request), token: parsed.data.token, platform: parsed.data.platform };
  const token = await prisma.deviceToken.upsert({ where: { token: data.token }, update: { ...data, isActive: true, lastUsedAt: new Date() }, create: { ...data, lastUsedAt: new Date() } });
  return response.status(201).json(token);
});
router.delete("/device-tokens/:token", requireUser, async (request, response) => {
  const result = await prisma.deviceToken.updateMany({ where: { token: request.params.token, userId: callerUserId(request) }, data: { isActive: false } });
  // 404 (not 403) for someone else's token, so existence is not leaked.
  if (result.count === 0) return response.status(404).json({ error: "NOT_FOUND", message: "Device token not found" });
  return response.status(204).send();
});
// Notification preferences: kept for older clients and the e2e / gateway checks, but nothing reads them any more
// (the app's "Cài đặt thông báo" was removed and promotion dispatch ignores them: everything is on). Not deleted.
const preferencesSchema = z.object({ pushEnabled: z.boolean().optional(), promotionEnabled: z.boolean().optional(), quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional() });
const readPreferences = async (request: Request, response: Response) => {
  if (namesOtherUser(request, request.params.userId)) return forbidOtherUser(response);
  const userId = callerUserId(request);
  return response.json(await prisma.notificationPreference.upsert({ where: { userId }, update: {}, create: { userId } }));
};
const writePreferences = async (request: Request, response: Response) => {
  if (namesOtherUser(request, request.params.userId)) return forbidOtherUser(response);
  const parsed = preferencesSchema.safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const userId = callerUserId(request);
  return response.json(await prisma.notificationPreference.upsert({ where: { userId }, update: parsed.data, create: { userId, ...parsed.data } }));
};
router.get("/preferences", requireUser, readPreferences);
router.put("/preferences", requireUser, writePreferences);
// Kept for older clients; :userId must be the caller.
router.get("/preferences/:userId", requireUser, readPreferences);
router.put("/preferences/:userId", requireUser, writePreferences);
router.post("/partners", apiKeyGuard, async (request, response) => {
  const parsed = z.object({ name: z.string().min(1), logoUrl: z.string().url().optional() }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const existing = await prisma.partnerSupermarket.findFirst({ where: { name: parsed.data.name } });
  return response.status(existing ? 200 : 201).json(existing || await prisma.partnerSupermarket.create({ data: parsed.data }));
});
router.post("/partners/:partnerId/promotions", apiKeyGuard, async (request, response) => {
  const rows = z.array(promotionSchema).min(1).max(500).safeParse(request.body);
  if (!rows.success) return error(response, rows.error.flatten());
  const partner = await prisma.partnerSupermarket.findUnique({ where: { id: request.params.partnerId } });
  if (!partner) return response.status(404).json({ error: "NOT_FOUND", message: "Partner not found" });
  const result = await prisma.$transaction(async (tx) => {
    const promotions = [];
    for (const row of rows.data) {
      const data = { ...row, productKeywords: normalizedKeywords(row.productKeywords), partnerId: partner.id };
      const existing = await tx.promotion.findFirst({ where: { partnerId: partner.id, title: row.title } });
      promotions.push(existing ? await tx.promotion.update({ where: { id: existing.id }, data }) : await tx.promotion.create({ data }));
    }
    return promotions;
  });
  return response.status(201).json({ promotions: result });
});
router.get("/promotions", async (request, response) => {
  const current = new Date();
  const where = { isActive: request.query.active === "true" ? true : undefined, startsAt: request.query.active === "true" ? { lte: current } : undefined, endsAt: request.query.active === "true" ? { gte: current } : undefined, title: request.query.keyword ? { contains: String(request.query.keyword), mode: "insensitive" as const } : undefined };
  const take = page(request.query.limit, 20, 100); const skip = (page(request.query.page, 1, 100000) - 1) * take;
  const [items, total] = await prisma.$transaction([prisma.promotion.findMany({ where, skip, take, orderBy: { startsAt: "desc" } }), prisma.promotion.count({ where })]);
  return response.json({ items, page: Math.floor(skip / take) + 1, limit: take, total });
});
router.post("/promotions/match", async (request, response) => {
  const parsed = z.object({ userId: z.string().min(1), keywords: z.array(z.string()).min(1) }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const promotions = await prisma.promotion.findMany({ where: { isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } });
  return response.json({ promotions: promotions.filter((promotion) => keywordsOverlap(promotion.productKeywords, parsed.data.keywords)) });
});
router.get("/notifications", requireUser, async (request, response) => {
  if (namesOtherUser(request, request.query.userId)) return forbidOtherUser(response);
  const status = z.enum(["PENDING", "SENT", "FAILED", "READ"]).optional().safeParse(request.query.status || undefined);
  if (!status.success) return error(response, status.error.flatten());
  const take = page(request.query.limit, 20, 100); const skip = (page(request.query.page, 1, 100000) - 1) * take;
  const where = { userId: callerUserId(request), status: status.data };
  // Promotions are in-app only: the caller's feed rows for active promotions are made here (feed and badge both call
  // this). A failure only means they appear on the next read.
  await ensureActivePromotionRows(callerUserId(request)).catch((caught: unknown) => console.warn(JSON.stringify({ event: "promotion_feed_rows_failed", message: caught instanceof Error ? caught.message : "unknown" })));
  const [items, total] = await prisma.$transaction([prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }), prisma.notification.count({ where })]); return response.json({ items, page: Math.floor(skip / take) + 1, limit: take, total });
});
router.patch("/notifications/:id/read", requireUser, async (request, response) => {
  // Scoped to the caller: someone else's notification is reported as 404, like a missing one.
  const result = await prisma.notification.updateMany({ where: { id: request.params.id, userId: callerUserId(request) }, data: { status: "READ", readAt: new Date() } });
  if (result.count === 0) return response.status(404).json({ error: "NOT_FOUND", message: "Notification not found" });
  return response.json(await prisma.notification.findUnique({ where: { id: request.params.id } }));
});
// Thông báo multi-select "Xóa": deletes the caller's own rows among `ids` (bulk, idempotent: unknown, already deleted
// and other users' ids are skipped silently, so nothing about them leaks and nobody else's feed changes). A deleted
// promotion row also records the dismissal "promotion:<id>", otherwise the feed would make the row again on the next read.
router.post("/notifications/delete", requireUser, async (request, response) => {
  const parsed = z.object({ ids: z.array(z.string().trim().min(1).max(100)).min(1).max(200) }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const userId = callerUserId(request);
  const ids = [...new Set(parsed.data.ids)];
  const deleted = await prisma.$transaction(async (tx) => {
    const promotionRows = await tx.notification.findMany({ where: { id: { in: ids }, userId, type: "PROMOTION" }, select: { data: true } });
    const keys = promotionRows.map((row) => (row.data as { promotionId?: unknown } | null)?.promotionId).filter((id): id is string => typeof id === "string").map(promotionDismissalKey);
    if (keys.length > 0) await tx.notificationDismissal.createMany({ data: keys.map((key) => ({ userId, key })), skipDuplicates: true });
    return (await tx.notification.deleteMany({ where: { id: { in: ids }, userId } })).count;
  });
  return response.json({ deleted });
});

// Dismissed computed items (see NotificationDismissal in schema.prisma): the caller's keys only.
const dismissalKey = z.string().trim().regex(/^(week|expiry|promotion):[^\s]{1,190}$/);
router.get("/notifications/dismissals", requireUser, async (request, response) => {
  const rows = await prisma.notificationDismissal.findMany({ where: { userId: callerUserId(request) }, select: { key: true }, orderBy: { createdAt: "desc" }, take: 1000 });
  return response.json({ keys: rows.map((row) => row.key) });
});
router.post("/notifications/dismissals", requireUser, async (request, response) => {
  const parsed = z.object({ keys: z.array(dismissalKey).min(1).max(200) }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const userId = callerUserId(request);
  const created = await prisma.notificationDismissal.createMany({ data: [...new Set(parsed.data.keys)].map((key) => ({ userId, key })), skipDuplicates: true });
  // Old week / expiry keys can never match again: drop the caller's keys older than DISMISSAL_KEEP_DAYS.
  await prisma.notificationDismissal.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - DISMISSAL_KEEP_DAYS * 86_400_000) }, NOT: { key: { startsWith: "promotion:" } } } });
  return response.json({ dismissed: created.count });
});

// Putting a promotion into users' Thông báo now is an operator action (admin screens / support, e2e smoke), not a
// partner one. Feed rows only: promotions are never pushed. Without userIds: every user with an active device token
// (everyone else gets the row on their next read anyway).
router.post("/promotions/:id/dispatch", requireAdmin, async (request, response) => {
  const parsed = z.object({ userIds: z.array(z.string()).optional() }).safeParse(request.body || {}); if (!parsed.success) return error(response, parsed.error.flatten());
  const users = parsed.data.userIds || (await prisma.deviceToken.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } })).map((user) => user.userId);
  return response.json({ dispatched: await dispatchPromotion(request.params.id, users) });
});

// Admin cleanup (data fixes, e2e teardown): deletes one promotion for good. Unknown ids are 404.
router.delete("/promotions/:id", requireAdmin, async (request, response) => {
  const deleted = await prisma.promotion.deleteMany({ where: { id: request.params.id } });
  if (deleted.count === 0) return response.status(404).json({ error: "NOT_FOUND", message: "Promotion not found" });
  return response.json({ deleted: deleted.count });
});

export default router;
