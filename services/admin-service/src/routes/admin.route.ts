import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { requireUser } from "../middleware/require-user";
import { defaultWeights, knownWeightKeys } from "../config/weights";
import { imageUrlProblem } from "../lib/image-url";
import { addDays, dayOf, DEFAULT_PROMO_DAYS, promotionSync, vnToday, type SyncableIngredient } from "../lib/promotion-sync";
import { ingredientUsage, UsageCheckError } from "../lib/ingredient-usage";

const router = Router();
// Promotion fields: "" from a cleared form field means "none".
const emptyToNull = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? null : value);
const imageUrlSchema = z.preprocess(emptyToNull, z.string().trim().superRefine((value, context) => {
  const problem = imageUrlProblem(value);
  if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
}).nullable().optional());
const discountPercentSchema = z.preprocess(emptyToNull, z.number().int().min(1).max(100).nullable().optional());
/** Optional price in whole VND; "" from a cleared form field means "no price". */
const priceSchema = z.preprocess(emptyToNull, z.number().int("Giá phải là số nguyên (đồng)").nonnegative("Giá không được âm").max(1_000_000_000).nullable().optional());
const isCalendarDay = (day: string): boolean => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
const promoEndDateSchema = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(isCalendarDay, "Not a valid date").refine((day) => day >= vnToday(), "Must be today or later").nullable().optional());
/** Optional image credit text (Commons author / license / page link); "" means none. */
const creditSchema = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();

/**
 * A new image link without its own credit drops the old credit (it belonged to the previous image), so a pasted
 * link never shows someone else's author or license.
 */
const creditColumns = (input: Partial<IngredientInput>, before: { imageUrl: string | null } | null) =>
  input.imageUrl !== undefined && (input.imageUrl ?? null) !== (before?.imageUrl ?? null)
    && input.imageSource === undefined && input.imageAuthor === undefined && input.imageLicense === undefined
    ? { imageSource: null, imageAuthor: null, imageLicense: null }
    : {};

const ingredientSchema = z.object({ name: z.string().min(1), category: z.string().min(1), defaultUnit: z.string().min(1), shelfLifeDays: z.number().int().nonnegative().max(3650).nullable().optional(), caloriesPer100g: z.number().nonnegative().nullable().optional(), proteinPer100g: z.number().nonnegative().nullable().optional(), carbsPer100g: z.number().nonnegative().nullable().optional(), fatPer100g: z.number().nonnegative().nullable().optional(), allergenTags: z.array(z.string()).default([]), isActive: z.boolean().optional(), imageUrl: imageUrlSchema, imageSource: creditSchema(2048), imageAuthor: creditSchema(300), imageLicense: creditSchema(100), discountPercent: discountPercentSchema, promoEndDate: promoEndDateSchema, price: priceSchema });
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
/** A discount counts only while its last day (Vietnam time) has not passed; no end date = rolling default. */
const activeDiscountWhere = (today: Date) => ({ discountPercent: { not: null }, OR: [{ promoEndDate: null }, { promoEndDate: { gte: today } }] });
const catalogQuerySchema = z.object({
  search: z.string().optional(),
  q: z.string().optional(), // older name of `search` (Kho add-item suggestions)
  group: z.string().trim().max(80).optional(),
  onSale: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  limit: z.coerce.number().int().min(1).catch(20).default(20).transform((value) => Math.min(value, 50)),
});

/**
 * Read-only market catalog for any signed-in user (Đi chợ products, Kho add-item suggestions): active rows only,
 * public fields only. A discount (and its end date) is returned only while the promotion is still valid.
 */
router.get("/catalog/ingredients", requireUser, async (request, response) => {
  const parsed = catalogQuerySchema.safeParse(request.query);
  if (!parsed.success) return resultError(response, parsed.error.flatten());
  const { page, limit, group, onSale } = parsed.data;
  const search = normalize(parsed.data.search ?? parsed.data.q ?? "").slice(0, 80);
  const todayDay = vnToday();
  const today = new Date(`${todayDay}T00:00:00.000Z`);
  const where = {
    isActive: true,
    ...(search ? { nameNormalized: { contains: search } } : {}),
    ...(group ? { category: { equals: group, mode: "insensitive" as const } } : {}),
    ...(onSale === "true" ? activeDiscountWhere(today) : {}),
  };
  const [rows, total, groups] = await prisma.$transaction([
    prisma.masterIngredient.findMany({
      where,
      select: { id: true, name: true, category: true, defaultUnit: true, shelfLifeDays: true, imageUrl: true, imageSource: true, imageAuthor: true, imageLicense: true, discountPercent: true, promoEndDate: true, price: true },
      orderBy: { nameNormalized: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.masterIngredient.count({ where }),
    prisma.masterIngredient.findMany({ where: { isActive: true }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);
  const items = rows.map((row) => {
    const endDay = row.promoEndDate ? dayOf(row.promoEndDate) : null;
    const onPromotion = row.discountPercent !== null && (endDay === null || endDay >= todayDay);
    return {
      id: row.id,
      name: row.name,
      group: row.category,
      unit: row.defaultUnit,
      shelfLifeDays: row.shelfLifeDays,
      imageUrl: row.imageUrl,
      // Credit for Commons images (shown under the photo in the product sheet).
      imageSource: row.imageSource,
      imageAuthor: row.imageAuthor,
      imageLicense: row.imageLicense,
      discountPercent: onPromotion ? row.discountPercent : null,
      promoEndDate: onPromotion ? endDay : null,
      price: row.price,
    };
  });
  return response.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), groups: groups.map((row) => row.category) });
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
  try { after = await prisma.$transaction(async (tx) => { const updated = await tx.masterIngredient.update({ where: { id: before.id }, data: { ...parsed.data, ...promoColumns(parsed.data, before), ...creditColumns(parsed.data, before), ...(parsed.data.name ? { nameNormalized: normalize(parsed.data.name) } : {}) } }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "UPDATE", targetType: "MasterIngredient", targetId: updated.id, metadata: { before, after: updated } } }); return updated; }); } catch { return response.status(409).json({ error: "CONFLICT", message: "Ingredient name already exists" }); }
  return response.json({ ...after, promotionSync: await promotionSync.sync(after, hadPromotion(before)) });
});
// Hiding an ingredient (soft delete) withdraws its promotion; showing it again republishes it.
router.patch("/ingredients/:id/active", async (request, response) => { const parsed = z.object({ isActive: z.boolean() }).safeParse(request.body); if (!parsed.success) return resultError(response, parsed.error.flatten()); const before = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } }); if (!before) return response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" }); const after = await prisma.$transaction(async (tx) => { const item = await tx.masterIngredient.update({ where: { id: before.id }, data: parsed.data }); await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "SET_ACTIVE", targetType: "MasterIngredient", targetId: item.id, metadata: { before, after: item } } }); return item; }); return response.json({ ...after, promotionSync: await promotionSync.sync(after, hadPromotion(before)) }); });
/**
 * Permanent delete. Refused with 409 IN_USE while anything still points at the ingredient (a running or already
 * sent promotion, shopping-list items added from the market); then nothing is deleted and the admin can hide it
 * instead. If another service cannot answer, 503 and nothing is deleted. A synced promotion that was never sent
 * is removed together with the ingredient.
 */
router.delete("/ingredients/:id", async (request, response) => {
  const before = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } });
  if (!before) return response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" });
  let usage;
  try { usage = await ingredientUsage.check(before.id); } catch (error) {
    if (!(error instanceof UsageCheckError)) throw error;
    console.error(JSON.stringify({ event: "ingredient_usage_check_failed", ingredientId: before.id, message: error.message }));
    return response.status(503).json({ error: "USAGE_CHECK_UNAVAILABLE", message: "Không kiểm tra được nguyên liệu đang được dùng ở đâu, chưa xóa. Thử lại sau." });
  }
  const reasons = [...usage.reasons];
  // The row's own discount still running counts too (even if its promotion sync failed earlier).
  if (before.isActive && before.discountPercent !== null && (!before.promoEndDate || dayOf(before.promoEndDate) >= vnToday()) && !reasons.includes("đang có khuyến mãi")) reasons.unshift("đang có khuyến mãi");
  if (reasons.length > 0) return response.status(409).json({ error: "IN_USE", code: "IN_USE", message: `Nguyên liệu ${reasons.join(", ")}.`, reasons });
  if (usage.promotionExists) {
    try { await ingredientUsage.removePromotion(before.id); } catch (error) {
      if (!(error instanceof UsageCheckError)) throw error;
      return response.status(503).json({ error: "USAGE_CHECK_UNAVAILABLE", message: "Không xóa được khuyến mãi của nguyên liệu, chưa xóa. Thử lại sau." });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.masterIngredient.delete({ where: { id: before.id } });
    await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "DELETE", targetType: "MasterIngredient", targetId: before.id, metadata: { before } } });
  });
  return response.status(204).end();
});
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
