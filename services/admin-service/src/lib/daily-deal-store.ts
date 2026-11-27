import { prisma } from "./prisma";
import { addDays, dayOf, vnToday } from "./promotion-sync";
import { DEFAULT_SETTINGS, NO_REPEAT_DAYS, hasManualDiscount, nameKey, pickReplacement, selectDeals, type DealProduct, type DealSettings, type PickedDeal } from "./daily-deals";

/**
 * Daily deals in the database (daily-deals.ts has the rules).
 * - Lazy: the day's selection is made by the first request that needs it (the market catalog), so it works with
 *   scheduled jobs off. Under a per-day Postgres advisory lock, in one transaction with the DailyDealDay marker, so
 *   concurrent first requests make exactly one selection; the unique (day, productId) is the last guard.
 * - Applied on read: only while the feature is on, the product is not excluded and has no admin discount running
 *   (admin discounts always win). A deal ends with its Vietnam day (rows are per day).
 * - Never synced to notification-service (no Thông báo row).
 */
const MENU_SERVICE_URL = () => (process.env.MENU_SERVICE_URL || "http://localhost:4007").replace(/\/+$/, "").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://");
const CACHE_MS = 30_000;

const asDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
type ProductRow = { id: string; name: string; englishName: string | null; isActive: boolean; price: number | null; discountPercent: number | null; promoStartDate: Date | null; promoEndDate: Date | null };
const PRODUCT_SELECT = { id: true, name: true, englishName: true, isActive: true, price: true, discountPercent: true, promoStartDate: true, promoEndDate: true } as const;
export const dealProductOf = (row: ProductRow): DealProduct => ({
  id: row.id, name: row.name, isActive: row.isActive, price: row.price, discountPercent: row.discountPercent,
  promoStartDay: row.promoStartDate ? dayOf(row.promoStartDate) : null, promoEndDay: row.promoEndDate ? dayOf(row.promoEndDate) : null,
});

type Tx = Pick<typeof prisma, "dailyDeal" | "dailyDealDay" | "masterIngredient" | "dailyDealSettings" | "$executeRaw">;

export async function getSettings(client: Pick<typeof prisma, "dailyDealSettings"> = prisma): Promise<DealSettings & { updatedAt?: Date }> {
  const row = await client.dailyDealSettings.findUnique({ where: { id: 1 } });
  return row ? { enabled: row.enabled, dealsPerDay: row.dealsPerDay, minPercent: row.minPercent, maxPercent: row.maxPercent, excludedProductIds: row.excludedProductIds, updatedAt: row.updatedAt } : { ...DEFAULT_SETTINGS };
}

/** Households per catalog product id in this week's menus (menu-service, anonymous). {} when it cannot answer. */
export async function menuUsage(products: Array<{ id: string; name: string; englishName: string | null }>): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return usage;
  try {
    const response = await fetch(`${MENU_SERVICE_URL()}/internal/week-product-usage`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return usage;
    const body = (await response.json()) as { items?: Array<{ name?: unknown; households?: unknown }> };
    const byName = new Map<string, string>();
    for (const product of products) {
      byName.set(nameKey(product.name), product.id);
      if (product.englishName) byName.set(nameKey(product.englishName), product.id);
    }
    for (const item of body.items ?? []) {
      if (typeof item.name !== "string" || typeof item.households !== "number") continue;
      const id = byName.get(nameKey(item.name));
      if (id) usage.set(id, Math.max(usage.get(id) ?? 0, item.households));
    }
  } catch {
    // Only the random half then.
  }
  return usage;
}

/** Product ids that were daily deals in the NO_REPEAT_DAYS days before `day`. */
const recentIds = async (client: Pick<Tx, "dailyDeal">, day: string): Promise<Set<string>> => {
  const rows = await client.dailyDeal.findMany({ where: { day: { gte: asDay(addDays(day, -NO_REPEAT_DAYS)), lt: asDay(day) } }, select: { productId: true } });
  return new Set(rows.map((row) => row.productId));
};

/**
 * Makes the day's selection if nobody did yet (idempotent; one selection per day even under concurrent calls).
 * `reroll`: "Chọn lại hôm nay" replaces the day's rows with a new seed. Returns the day's rows.
 */
export async function ensureDay(day: string, options: { reroll?: boolean; usage?: Map<string, number> } = {}) {
  // Read outside the transaction (network call): the products and their menu usage.
  const settings = await getSettings();
  const rows = await prisma.masterIngredient.findMany({ where: { isActive: true, price: { gt: 0 } }, select: PRODUCT_SELECT });
  const marker = options.reroll ? null : await prisma.dailyDealDay.findUnique({ where: { day: asDay(day) } });
  if (marker) return prisma.dailyDeal.findMany({ where: { day: asDay(day) }, orderBy: { createdAt: "asc" } });
  const usage = options.usage ?? (settings.enabled ? await menuUsage(rows) : new Map<string, number>());
  return prisma.$transaction(async (tx) => {
    // Per-day lock: a second caller waits here, then finds the marker and changes nothing.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-deals:${day}`}))`;
    const existing = await tx.dailyDealDay.findUnique({ where: { day: asDay(day) } });
    if (existing && !options.reroll) return tx.dailyDeal.findMany({ where: { day: asDay(day) }, orderBy: { createdAt: "asc" } });
    const reroll = existing ? existing.rerolls + 1 : 0;
    const picks = selectDeals({ day, products: rows.map(dealProductOf), settings, recentProductIds: await recentIds(tx, day), usage, reroll });
    if (existing) await tx.dailyDeal.deleteMany({ where: { day: asDay(day) } });
    if (picks.length > 0) await tx.dailyDeal.createMany({ data: picks.map((pick) => ({ day: asDay(day), ...pick })), skipDuplicates: true });
    if (existing) await tx.dailyDealDay.update({ where: { day: asDay(day) }, data: { rerolls: reroll } });
    else await tx.dailyDealDay.create({ data: { day: asDay(day) } });
    return tx.dailyDeal.findMany({ where: { day: asDay(day) }, orderBy: { createdAt: "asc" } });
  });
}

/** "Đổi món": replace one product of the day with another eligible one. null when nothing else is eligible. */
export async function swapDeal(day: string, productId: string): Promise<{ removed: string; added: PickedDeal } | null> {
  const settings = await getSettings();
  const rows = await prisma.masterIngredient.findMany({ where: { isActive: true, price: { gt: 0 } }, select: PRODUCT_SELECT });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily-deals:${day}`}))`;
    const today = await tx.dailyDeal.findMany({ where: { day: asDay(day) }, select: { productId: true } });
    if (!today.some((row) => row.productId === productId)) return null;
    const todayIds = new Set(today.map((row) => row.productId));
    const added = pickReplacement({ day, replacedId: productId, todayIds, products: rows.map(dealProductOf), settings, recentProductIds: await recentIds(tx, day), attempt: today.length });
    if (!added) return null;
    await tx.dailyDeal.deleteMany({ where: { day: asDay(day), productId } });
    await tx.dailyDeal.create({ data: { day: asDay(day), ...added } });
    return { removed: productId, added };
  });
}

let cache: { day: string; at: number; percents: Map<string, number> } | null = null;
export const clearDealCache = (): void => { cache = null; };

/**
 * Discount % per product id from today's deals, as the catalog applies them (feature on, not excluded, no admin
 * discount). Cached 30 s per process; any failure → no deals (the catalog still answers).
 */
export async function todaysDealPercents(now: Date = new Date()): Promise<Map<string, number>> {
  const day = vnToday(now);
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS) return cache.percents;
  try {
    const settings = await getSettings();
    const percents = new Map<string, number>();
    if (settings.enabled) {
      const deals = await ensureDay(day);
      const excluded = new Set(settings.excludedProductIds);
      const products = await prisma.masterIngredient.findMany({ where: { id: { in: deals.map((deal) => deal.productId) } }, select: PRODUCT_SELECT });
      const byId = new Map(products.map((product) => [product.id, dealProductOf(product)]));
      for (const deal of deals) {
        const product = byId.get(deal.productId);
        if (!product || !product.isActive || excluded.has(deal.productId) || hasManualDiscount(product, day)) continue;
        percents.set(deal.productId, deal.percent);
      }
    }
    cache = { day, at: Date.now(), percents };
    return percents;
  } catch (error) {
    console.error(JSON.stringify({ event: "daily_deals_failed", message: error instanceof Error ? error.message : "unknown" }));
    return new Map();
  }
}
