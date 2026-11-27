import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { vnToday } from "../lib/promotion-sync";
import { settingsProblems } from "../lib/daily-deals";
import { clearDealCache, dealProductOf, ensureDay, getSettings, swapDeal } from "../lib/daily-deal-store";
import { hasManualDiscount } from "../lib/daily-deals";

/**
 * Quản trị › "Giảm giá tự động" (ADMIN only; every change is in the audit log, targetType "DailyDeal"):
 * - GET  /daily-deals                          settings, today's list (product, %), the products for the exclusion list
 * - PUT  /daily-deals/settings                 enabled, dealsPerDay (1-30), minPercent ≤ maxPercent (1-50), excluded
 * - POST /daily-deals/today/:productId/swap    "Đổi món": another eligible product for that row
 * - POST /daily-deals/today/reroll             "Chọn lại hôm nay": a new selection for today
 * Settings changes apply to the next selection (tomorrow, or "Chọn lại hôm nay"); turning the feature off or
 * excluding a product takes effect in the catalog at once.
 */
const router = Router();
router.use("/daily-deals", requireAdmin);

const settingsSchema = z.object({
  enabled: z.boolean(),
  dealsPerDay: z.number().int(),
  minPercent: z.number().int(),
  maxPercent: z.number().int(),
  excludedProductIds: z.array(z.string().trim().min(1).max(64)).max(500).default([]),
});
const audit = (adminId: string, action: string, metadata: unknown) =>
  prisma.auditLog.create({ data: { adminUserId: adminId, action, targetType: "DailyDeal", targetId: null, metadata: metadata as object } });

/** Today's list as the admin screen shows it, with whether each deal is applied right now (and why not). */
const todayView = async (day: string) => {
  const settings = await getSettings();
  const deals = await ensureDay(day);
  const products = await prisma.masterIngredient.findMany({ where: { id: { in: deals.map((deal) => deal.productId) } }, select: { id: true, name: true, englishName: true, category: true, isActive: true, price: true, discountPercent: true, promoStartDate: true, promoEndDate: true } });
  const byId = new Map(products.map((product) => [product.id, product]));
  const excluded = new Set(settings.excludedProductIds);
  return deals.map((deal) => {
    const product = byId.get(deal.productId);
    const status = !product || !product.isActive ? "INACTIVE" : excluded.has(deal.productId) ? "EXCLUDED" : hasManualDiscount(dealProductOf(product), day) ? "MANUAL_DISCOUNT" : !settings.enabled ? "OFF" : "APPLIED";
    return { productId: deal.productId, name: product?.name ?? "(đã xóa)", group: product?.category ?? null, price: product?.price ?? null, percent: deal.percent, source: deal.source, status };
  });
};

router.get("/daily-deals", async (_request, response) => {
  const day = vnToday();
  const [settings, deals, products] = await Promise.all([
    getSettings(),
    todayView(day),
    prisma.masterIngredient.findMany({ where: { isActive: true, price: { gt: 0 } }, select: { id: true, name: true, category: true }, orderBy: { nameNormalized: "asc" } }),
  ]);
  const { updatedAt, ...publicSettings } = settings;
  return response.json({ day, settings: { ...publicSettings, updatedAt: updatedAt?.toISOString() ?? null }, deals, products: products.map((product) => ({ id: product.id, name: product.name, group: product.category })) });
});

router.put("/daily-deals/settings", async (request, response) => {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.flatten() });
  const problems = settingsProblems(parsed.data);
  if (Object.keys(problems).length > 0) {
    return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid request", details: { fieldErrors: Object.fromEntries(Object.entries(problems).map(([field, message]) => [field, [message]])) } });
  }
  const data = { ...parsed.data, excludedProductIds: [...new Set(parsed.data.excludedProductIds)], updatedBy: adminUserId(request) };
  const before = await getSettings();
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.dailyDealSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "UPDATE_SETTINGS", targetType: "DailyDeal", targetId: null, metadata: { before: { ...before, updatedAt: undefined }, after: data } } });
    return row;
  });
  clearDealCache();
  return response.json({ settings: { enabled: saved.enabled, dealsPerDay: saved.dealsPerDay, minPercent: saved.minPercent, maxPercent: saved.maxPercent, excludedProductIds: saved.excludedProductIds } });
});

router.post("/daily-deals/today/reroll", async (request, response) => {
  const day = vnToday();
  const before = (await prisma.dailyDeal.findMany({ where: { day: new Date(`${day}T00:00:00.000Z`) }, select: { productId: true, percent: true } }));
  await ensureDay(day, { reroll: true });
  clearDealCache();
  const deals = await todayView(day);
  await audit(adminUserId(request), "REROLL", { day, before, after: deals.map((deal) => ({ productId: deal.productId, percent: deal.percent })) });
  return response.json({ day, deals });
});

router.post("/daily-deals/today/:productId/swap", async (request, response) => {
  const day = vnToday();
  const result = await swapDeal(day, request.params.productId);
  if (!result) {
    const inToday = await prisma.dailyDeal.count({ where: { day: new Date(`${day}T00:00:00.000Z`), productId: request.params.productId } });
    return inToday === 0
      ? response.status(404).json({ error: "NOT_FOUND", message: "Sản phẩm không có trong danh sách hôm nay" })
      : response.status(409).json({ error: "NO_CANDIDATE", message: "Không còn sản phẩm nào khác đủ điều kiện" });
  }
  clearDealCache();
  await audit(adminUserId(request), "SWAP", { day, removed: result.removed, added: result.added });
  return response.json({ day, deals: await todayView(day) });
});

export default router;
