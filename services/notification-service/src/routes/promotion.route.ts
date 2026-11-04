import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { keywordsOverlap, normalizedKeywords } from "../lib/promotion";
import { dispatchPromotion } from "../services/promotion-dispatch.service";

const router = Router();
const apiKeyGuard = (request: Request, response: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void): void => {
  const expected = process.env.PARTNER_API_KEY || "";
  const actual = request.header("x-api-key") || "";
  const valid = expected.length > 0 && actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  if (!valid) { response.status(401).json({ error: "UNAUTHORIZED", message: "Invalid partner API key" }); return; }
  next();
};
const error = (response: { status: (code: number) => { json: (body: unknown) => void } }, details: unknown): void => response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details });
const page = (value: unknown, fallback: number, max: number): number => Math.min(Math.max(Number(value) || fallback, 1), max);
const promotionSchema = z.object({ title: z.string().min(1), description: z.string().optional(), discountInfo: z.string().optional(), productKeywords: z.array(z.string()), imageUrl: z.string().url().optional(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), isActive: z.boolean().optional() });

router.post("/device-tokens", async (request, response) => {
  const parsed = z.object({ userId: z.string().min(1), token: z.string().min(1), platform: z.enum(["IOS", "ANDROID"]) }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  const token = await prisma.deviceToken.upsert({ where: { token: parsed.data.token }, update: { ...parsed.data, isActive: true, lastUsedAt: new Date() }, create: { ...parsed.data, lastUsedAt: new Date() } });
  return response.status(201).json(token);
});
router.delete("/device-tokens/:token", async (request, response) => { await prisma.deviceToken.updateMany({ where: { token: request.params.token }, data: { isActive: false } }); return response.status(204).send(); });
router.get("/preferences/:userId", async (request, response) => response.json(await prisma.notificationPreference.upsert({ where: { userId: request.params.userId }, update: {}, create: { userId: request.params.userId } })));
router.put("/preferences/:userId", async (request, response) => {
  const parsed = z.object({ pushEnabled: z.boolean().optional(), promotionEnabled: z.boolean().optional(), quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional() }).safeParse(request.body);
  if (!parsed.success) return error(response, parsed.error.flatten());
  return response.json(await prisma.notificationPreference.upsert({ where: { userId: request.params.userId }, update: parsed.data, create: { userId: request.params.userId, ...parsed.data } }));
});
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
router.get("/notifications", async (request, response) => {
  const take = page(request.query.limit, 20, 100); const skip = (page(request.query.page, 1, 100000) - 1) * take;
  const where = { userId: String(request.query.userId || ""), status: request.query.status ? String(request.query.status) as "PENDING" | "SENT" | "FAILED" | "READ" : undefined };
  const [items, total] = await prisma.$transaction([prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }), prisma.notification.count({ where })]); return response.json({ items, page: Math.floor(skip / take) + 1, limit: take, total });
});
router.patch("/notifications/:id/read", async (request, response) => response.json(await prisma.notification.update({ where: { id: request.params.id }, data: { status: "READ", readAt: new Date() } })));
router.post("/promotions/:id/dispatch", async (request, response) => {
  const parsed = z.object({ userIds: z.array(z.string()).optional() }).safeParse(request.body || {}); if (!parsed.success) return error(response, parsed.error.flatten());
  const users = parsed.data.userIds || (await prisma.deviceToken.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } })).map((user) => user.userId);
  return response.json({ dispatched: await dispatchPromotion(request.params.id, users) });
});

export default router;
