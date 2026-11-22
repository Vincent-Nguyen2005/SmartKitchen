/**
 * Before a catalog ingredient is deleted for good, other services are asked whether they still point at it
 * (service-to-service, x-api-key = INTERNAL_API_KEY; the gateway answers 404 for /internal/*):
 * - notification-service: its synced promotion ("admin-ingredient:<id>") while it is running or after users were
 *   notified about it;
 * - shopping-list-service: shopping-list items added from the market (productId = the ingredient id).
 * Inventory, recipes and menus store ingredient names, never catalog ids, so they do not block a delete.
 * Any check that cannot be answered throws: a delete never goes ahead on a guess.
 */
import { externalIdFor } from "./promotion-sync";

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type IngredientUsage = { inUse: boolean; reasons: string[]; promotionExists: boolean };

export class UsageCheckError extends Error {}

export type IngredientUsageOptions = {
  notificationUrl: string;
  shoppingListUrl: string;
  apiKey: string | undefined;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

const withScheme = (url: string): string => url.replace(/\/+$/, "").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://");

export const createIngredientUsage = (options: IngredientUsageOptions) => {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 3000;

  const call = async (method: "GET" | "DELETE", url: string): Promise<Record<string, unknown>> => {
    if (!options.apiKey) throw new UsageCheckError("INTERNAL_API_KEY is not configured");
    let response;
    try {
      response = await fetchImpl(url, { method, headers: { "x-api-key": options.apiKey }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new UsageCheckError(error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) throw new UsageCheckError(`${new URL(url).host} answered ${response.status}`);
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  };

  const promotionPath = (ingredientId: string) => `${withScheme(options.notificationUrl)}/internal/promotions/${encodeURIComponent(externalIdFor(ingredientId))}`;

  /** Who still uses the ingredient; `reasons` are short Vietnamese phrases for the admin. */
  const check = async (ingredientId: string): Promise<IngredientUsage> => {
    const [promotion, shopping] = await Promise.all([
      call("GET", `${promotionPath(ingredientId)}/usage`),
      call("GET", `${withScheme(options.shoppingListUrl)}/internal/products/${encodeURIComponent(ingredientId)}/usage`),
    ]);
    const reasons: string[] = [];
    if (promotion.active === true) reasons.push("đang có khuyến mãi");
    if (typeof promotion.notified === "number" && promotion.notified > 0) reasons.push("khuyến mãi đã gửi tới người dùng");
    if (typeof shopping.items === "number" && shopping.items > 0) reasons.push(`có trong ${shopping.items} danh sách đi chợ`);
    return { inUse: reasons.length > 0, reasons, promotionExists: promotion.exists === true };
  };

  /** Removes the synced promotion (only called for an ingredient that is not in use). */
  const removePromotion = async (ingredientId: string): Promise<void> => { await call("DELETE", promotionPath(ingredientId)); };

  return { check, removePromotion };
};

export type IngredientUsageClient = ReturnType<typeof createIngredientUsage>;

/** Process-wide instance; reads the env variables on every call. */
export const ingredientUsage: IngredientUsageClient = createIngredientUsage({
  get notificationUrl() { return process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4010"; },
  get shoppingListUrl() { return process.env.SHOPPING_LIST_SERVICE_URL || "http://localhost:4008"; },
  get apiKey() { return process.env.INTERNAL_API_KEY; },
});
