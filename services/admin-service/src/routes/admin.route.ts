import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { requireUser } from "../middleware/require-user";
import { defaultWeights, knownWeightKeys } from "../config/weights";
import { imageUrlProblem } from "../lib/image-url";
import { addDays, DEFAULT_PROMO_DAYS, promotionSync, vnToday, type SyncableIngredient } from "../lib/promotion-sync";

const router = Router();
// Promotion fields: "" from a cleared form field means "none".
const emptyToNull = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? null : value);
const imageUrlSchema = z.preprocess(emptyToNull, z.string().trim().superRefine((value, context) => {
  const problem = imageUrlProblem(value);
  if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
}).nullable().optional());
const discountPercentSchema = z.preprocess(emptyToNull, z.number().int().min(1).max(100).nullable().optional());
const isCalendarDay = (day: string): boolean => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
const promoEndDateSchema = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(isCalendarDay, "Not a valid date").refine((day) => day >= vnToday(), "Must be today or later").nullable().optional());
const ingredientSchema = z.object({ name: z.string().min(1), category: z.string().min(1), defaultUnit: z.string().min(1), shelfLifeDays: z.number().int().nonnegative().max(3650).nullable().optional(), caloriesPer100g: z.number().nonnegative().nullable().optional(), proteinPer100g: z.number().nonnegative().nullable().optional(), carbsPer100g: z.number().nonnegative().nullable().optional(), fatPer100g: z.number().nonnegative().nullable().optional(), allergenTags: z.array(z.string()).default([]), isActive: z.boolean().optional(), imageUrl: imageUrlSchema, discountPercent: discountPercentSchema, promoEndDate: promoEndDateSchema });
type IngredientInput = z.infer<typeof ingredientSchema>;
type PromoBefore = { imageUrl: string | null; discountPercent: number | null; promoEndDate: Date | null } | null;

/**
 * Final promotion columns after merging the request into the stored row. Without a discount there is no end
 * date; with one and no end date given (or none stored), the promotion lasts DEFAULT_PROMO_DAYS from today.
 */
const promoColumns = (input: Partial<IngredientInput>, before: PromoBefore) => {
  const discountPercent = input.discountPercent !== undefined ? input.discountPercent ?? null : before?.discountPercent ?? null;
  const imageUrl = input.imageUrl !== undefined ? input.imageUrl ?? null : before?.imageUrl ?? null;
  let promoEndDate: Date | null = null;
  if (discountPercent !== null) {
    if (input.promoEndDate) promoEndDate = new Date(`${input.promoEndDate}T00:00:00.000Z`);
    else if (input.promoEndDate === undefined && before?.promoEndDate) promoEndDate = before.promoEndDate;
    else promoEndDate = new Date(`${addDays(vnToday(), DEFAULT_PROMO_DAYS)}T00:00:00.000Z`);
  }
  return { imageUrl, discountPercent, promoEndDate };
};
const hadPromotion = (before: PromoBefore): boolean => typeof before?.discountPercent === "number";
const normalize = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const resultError = (response: { status: (code: number) => { json: (body: unknown) => void } }, details: unknown): void => response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details });
const audit = (userId: string, action: string, targetId: string | null, metadata: unknown) => prisma.auditLog.create({ data: { adminUserId: userId, action, targetType: "MasterIngredient", targetId, metadata: metadata as object } });

router.get("/weights/effective", async (_request, response) => { const weights = await prisma.recommendationWeight.findMany(); return response.json({ weights: Object.fromEntries(weights.map((weight) => [weight.key, weight.value])), version: weights.reduce((max, weight) => Math.max(max, weight.version), 0), updatedAt: weights.reduce((latest, weight) => weight.updatedAt > latest ? weight.updatedAt : latest, new Date(0)) }); });
// Read-only catalog for any signed-in user (mobile add-item suggestions): active rows, public fields only.
router.get("/catalog/ingredients", requireUser, async (request, response) => {
  const query = typeof request.query.q === "string" ? normalize(request.query.q).slice(0, 80) : "";
  const take = Math.min(Math.max(Number(request.query.limit) || 1000, 1), 1000);
  const items = await prisma.masterIngredient.findMany({
    where: { isActive: true, ...(query ? { nameNormalized: { contains: query } } : {}) },
    select: { id: true, name: true, category: true, defaultUnit: true, shelfLifeDays: true },
    orderBy: { nameNormalized: "asc" },
    take,
  });
  return response.json({ items });
});
router.use(requireAdmin);
router.get("/ingredients", async (request, response) => {
  const take = Math.min(Math.max(Number(request.query.limit) || 20, 1), 100); const currentPage = Math.max(Number(request.query.page) || 1, 1);
  const where = { nameNormalized: request.query.search ? { contains: normalize(String(request.query.search)) } : undefined, category: request.query.category ? String(request.query.category) : undefined, isActive: request.query.isActive === undefined ? undefined : request.query.isActive === "true" };
  const [items, total] = await prisma.$transaction([prisma.masterIngredient.findMany({ where, skip: (currentPage - 1) * take, take, orderBy: { nameNormalized: request.query.sort === "desc" ? "desc" : "asc" } }), prisma.masterIngredient.count({ where })]); return response.json({ items, page: currentPage, limit: take, total });
});
router.get("/ingredients/export", async (_request, response) => response.json(await prisma.masterIngredient.findMany({ orderBy: { nameNormalized: "asc" } })));
router.get("/ingredients/:id", async (request, response) => { const item = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } }); return item ? response.json(item) : response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" }); });
router.post("/ingredients", async (request, response) => {
  const parsed = ingredientSchema.safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten());
  const data = { ...parsed.data, ...promoColumns(parsed.data, null), nameNormalized: normalize(parsed.data.name) };
  let item;
  try { item = await prisma.$transaction(async (tx) => { const created = await tx.masterIngredient.create({ data }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "CREATE", targetType: "MasterIngredient", targetId: created.id, metadata: { after: created } } }); return created; }); } catch { return response.status(409).json({ error: "CONFLICT", message: "Ingredient name already exists" }); }
  // The ingredient is saved first; a failed promotion sync is reported, never rolled back.
  return response.status(201).json({ ...item, promotionSync: await promotionSync.sync(item, false) });
});
router.put("/ingredients/:id", async (request, response) => {
  const parsed = ingredientSchema.partial().safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten());
  const before = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } }); if (!before) return response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" });
  let after;
  try { after = await prisma.$transaction(async (tx) => { const updated = await tx.masterIngredient.update({ where: { id: before.id }, data: { ...parsed.data, ...promoColumns(parsed.data, before), ...(parsed.data.name ? { nameNormalized: normalize(parsed.data.name) } : {}) } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "UPDATE", targetType: "MasterIngredient", targetId: updated.id, metadata: { before, after: updated } } }); return updated; }); } catch { return response.status(409).json({ error: "CONFLICT", message: "Ingredient name already exists" }); }
  return response.json({ ...after, promotionSync: await promotionSync.sync(after, hadPromotion(before)) });
});
// Hiding an ingredient (soft delete) withdraws its promotion; showing it again republishes it.
router.patch("/ingredients/:id/active", async (request, response) => { const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten()); const before = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } }); if (!before) return response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" }); const after = await prisma.$transaction(async (tx) => { const item = await tx.masterIngredient.update({ where: { id: before.id }, data: parsed.data }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "SET_ACTIVE", targetType: "MasterIngredient", targetId: item.id, metadata: { before, after: item } } }); return item; }); return response.json({ ...after, promotionSync: await promotionSync.sync(after, hadPromotion(before)) }); });
router.post("/ingredients/import", async (request, response) => {
  const parsed = z.array(ingredientSchema).max(500).safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten());
  const results = { created: 0, updated: 0, skipped: 0, errors: [] as unknown[], promotionSync: { synced: 0, failed: 0 } };
  const touched: { after: SyncableIngredient; before: PromoBefore }[] = [];
  await prisma.$transaction(async (tx) => { for (const row of parsed.data) { const nameNormalized = normalize(row.name); const existing = await tx.masterIngredient.findUnique({ where: { name: row.name } }); if (existing) { const after = await tx.masterIngredient.update({ where: { id: existing.id }, data: { ...row, ...promoColumns(row, existing), nameNormalized } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "IMPORT_UPDATE", targetType: "MasterIngredient", targetId: after.id, metadata: { before: existing, after } } }); touched.push({ after, before: existing }); results.updated++; } else { const created = await tx.masterIngredient.create({ data: { ...row, ...promoColumns(row, null), nameNormalized } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "IMPORT_CREATE", targetType: "MasterIngredient", targetId: created.id, metadata: { after: created } } }); touched.push({ after: created, before: null }); results.created++; } } });
  // Promotions are synced after the import commits, one call per ingredient that has or had a discount.
  for (const { after, before } of touched) {
    const result = await promotionSync.sync(after, hadPromotion(before));
    if (result !== "none") results.promotionSync[result]++;
  }
  return response.status(201).json(results);
});

router.get("/weights", async (_request, response) => response.json(await prisma.recommendationWeight.findMany({ orderBy: { key: "asc" } })));
router.get("/weights/:key", async (request, response) => { const item = await prisma.recommendationWeight.findUnique({ where: { key: request.params.key } }); return item ? response.json(item) : response.status(404).json({ error: "NOT_FOUND", message: "Weight not found" }); });
router.get("/weights/:key/history", async (request, response) => { const weight = await prisma.recommendationWeight.findUnique({ where: { key: request.params.key } }); if (!weight) return response.status(404).json({ error: "NOT_FOUND", message: "Weight not found" }); const take = Math.min(Math.max(Number(request.query.limit) || 20, 1), 100); const currentPage = Math.max(Number(request.query.page) || 1, 1); return response.json(await prisma.recommendationWeightHistory.findMany({ where: { weightId: weight.id }, skip: (currentPage - 1) * take, take, orderBy: { changedAt: "desc" } })); });
const weightUpdate = z.object({ value: z.number().min(0).max(1), description: z.string().optional(), expectedVersion: z.number().int().positive() });
router.put("/weights/:key", async (request, response) => { if (!knownWeightKeys.includes(request.params.key)) return response.status(404).json({ error: "NOT_FOUND", message: "Unknown weight key" }); const parsed = weightUpdate.safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten()); const current = await prisma.recommendationWeight.findUnique({ where: { key: request.params.key } }); if (!current) return response.status(404).json({ error: "NOT_FOUND", message: "Weight not seeded" }); if (current.version !== parsed.data.expectedVersion) return response.status(409).json({ error: "CONFLICT", message: "Weight version is stale", currentVersion: current.version }); const updated = await prisma.$transaction(async (tx) => { const item = await tx.recommendationWeight.update({ where: { id: current.id }, data: { value: parsed.data.value, description: parsed.data.description, updatedBy: adminUserId(request), version: { increment: 1 } } }); await tx.recommendationWeightHistory.create({ data: { weightId: item.id, oldValue: current.value, newValue: item.value, changedBy: adminUserId(request) } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "UPDATE", targetType: "RecommendationWeight", targetId: item.id, metadata: { before: current, after: item } } }); return item; }); return response.json(updated); });
router.post("/weights/reset-defaults", async (request, response) => { const changed = await prisma.$transaction(async (tx) => { const values = []; for (const [key, value] of Object.entries(defaultWeights)) { const current = await tx.recommendationWeight.findUnique({ where: { key } }); if (!current || current.value === value) continue; const item = await tx.recommendationWeight.update({ where: { id: current.id }, data: { value, updatedBy: adminUserId(request), version: { increment: 1 } } }); await tx.recommendationWeightHistory.create({ data: { weightId: item.id, oldValue: current.value, newValue: value, changedBy: adminUserId(request) } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "RESET", targetType: "RecommendationWeight", targetId: item.id, metadata: { before: current, after: item } } }); values.push(item); } return values; }); return response.json({ weights: changed }); });

export default router;
