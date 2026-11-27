/**
 * Keeps one user-facing promotion in notification-service per discounted master ingredient.
 * Service-to-service only: PUT/POST notification-service /internal/promotions/... with INTERNAL_API_KEY
 * (the same mechanism as notify-client). The gateway answers 404 for /internal/*, so clients never reach it,
 * and the partner key is not involved.
 */
export type PromotionSyncResult = "synced" | "failed" | "none";

export type SyncableIngredient = {
  id: string;
  name: string;
  isActive: boolean;
  imageUrl: string | null;
  discountPercent: number | null;
  promoEndDate: Date | null;
  /** First day of the discount; null on rows saved before start dates existed (= already running). */
  promoStartDate?: Date | null;
};

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

export type PromotionSyncOptions = {
  baseUrl: string;
  apiKey: string | undefined;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  logger?: (event: string, details: Record<string, unknown>) => void;
  now?: () => Date;
};

export const PROMOTION_PARTNER = "SmartKitchen";
export const DEFAULT_PROMO_DAYS = 7;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no DST

export const externalIdFor = (ingredientId: string): string => `admin-ingredient:${ingredientId}`;

/** Today's calendar date in Vietnam as YYYY-MM-DD. */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** YYYY-MM-DD plus `days` calendar days. */
export const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** A promotion starts at the beginning of its first day, Vietnam time (00:00 +07:00). */
export const startOfVnDay = (day: string): Date => new Date(`${day}T00:00:00.000+07:00`);

/**
 * Where a promotion window stands on Vietnam day `today`: before the first day "upcoming", from the first through the
 * whole last day "running", after it "ended". No start = already running; no end = no last day.
 */
export const promotionStatus = (startDay: string | null, endDay: string | null, today: string = vnToday()): "upcoming" | "running" | "ended" =>
  startDay !== null && today < startDay ? "upcoming" : endDay !== null && today > endDay ? "ended" : "running";

/** A promotion lasts through the whole last day, Vietnam time (23:59:59.999 +07:00). */
export const endOfVnDay = (day: string): Date => new Date(`${day}T23:59:59.999+07:00`);

/** Prisma returns @db.Date values as UTC midnight; this gives the calendar day back. */
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

export const wantsPromotion = (ingredient: SyncableIngredient): boolean => ingredient.isActive && ingredient.discountPercent !== null;

export const promotionPayload = (ingredient: SyncableIngredient, now: Date) => {
  const percent = ingredient.discountPercent as number;
  const lastDay = ingredient.promoEndDate ? dayOf(ingredient.promoEndDate) : addDays(vnToday(now), DEFAULT_PROMO_DAYS);
  const endsAt = endOfVnDay(lastDay);
  return {
    partnerName: PROMOTION_PARTNER,
    title: `${ingredient.name} giảm ${percent}%`,
    discountInfo: `${percent}%`,
    productKeywords: [ingredient.name],
    // notification-service accepts https links only: an uploaded image (gateway path) is left out of the promotion.
    imageUrl: ingredient.imageUrl && /^https:\/\//i.test(ingredient.imageUrl) ? ingredient.imageUrl : null,
    // From the start of the first day (Vietnam time). Rows without a start began "now". Never after endsAt, so an
    // already-ended promotion is stored (inactive by date) instead of rejected.
    startsAt: (() => {
      const startsAt = ingredient.promoStartDate ? startOfVnDay(dayOf(ingredient.promoStartDate)) : now;
      return (startsAt < endsAt ? startsAt : endsAt).toISOString();
    })(),
    endsAt: endsAt.toISOString(),
  };
};

const defaultLogger = (event: string, details: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event, ...details }));
};

export const createPromotionSync = (options: PromotionSyncOptions) => {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 3000;
  const logger = options.logger ?? defaultLogger;
  const now = options.now ?? (() => new Date());

  const call = async (method: "PUT" | "POST", path: string, body: unknown, ingredientId: string): Promise<PromotionSyncResult> => {
    if (!options.apiKey) {
      logger("promotion_sync_skipped", { ingredientId, reason: "INTERNAL_API_KEY not configured" });
      return "failed";
    }
    try {
      const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers: { "content-type": "application/json", "x-api-key": options.apiKey },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return "synced";
      logger("promotion_sync_failed", { ingredientId, status: response.status });
      return "failed";
    } catch (error) {
      logger("promotion_sync_failed", { ingredientId, message: error instanceof Error ? error.message : String(error) });
      return "failed";
    }
  };

  /**
   * Publish or withdraw the ingredient's promotion. `hadPromotion` says whether a promotion may exist
   * from an earlier save; when neither side wants one, nothing is called ("none").
   */
  const sync = async (ingredient: SyncableIngredient, hadPromotion: boolean): Promise<PromotionSyncResult> => {
    const path = `/internal/promotions/${encodeURIComponent(externalIdFor(ingredient.id))}`;
    if (wantsPromotion(ingredient)) return call("PUT", path, promotionPayload(ingredient, now()), ingredient.id);
    if (hadPromotion) return call("POST", `${path}/deactivate`, undefined, ingredient.id);
    return "none";
  };

  return { sync };
};

export type PromotionSync = ReturnType<typeof createPromotionSync>;

/** Process-wide instance; reads the same env variables as the report notifier on every call. */
export const promotionSync: PromotionSync = createPromotionSync({
  get baseUrl() { return (process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4010").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://"); },
  get apiKey() { return process.env.INTERNAL_API_KEY; },
});
