/**
 * Before a dish is deleted for good, menu-service is asked whether saved menus or dislike history still point at the
 * recipe id (GET /internal/recipes/:id/usage, x-api-key = INTERNAL_API_KEY; the gateway answers 404 for /internal/*).
 * An unanswered check throws: a delete never goes ahead on a guess.
 */
export type RecipeUsage = { menuItems: number; removedDishes: number };
export type RecipeUsageCheck = (recipeId: string) => Promise<RecipeUsage>;

export class RecipeUsageUnavailableError extends Error {}

type FetchLike = (input: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const createMenuUsageCheck = (options: { baseUrl: string; apiKey: string | undefined; fetchImpl?: FetchLike; timeoutMs?: number }): RecipeUsageCheck => async (recipeId) => {
  if (!options.apiKey) throw new RecipeUsageUnavailableError("INTERNAL_API_KEY is not configured");
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const base = options.baseUrl.replace(/\/+$/, "").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://");
  let response;
  try {
    response = await fetchImpl(`${base}/internal/recipes/${encodeURIComponent(recipeId)}/usage`, {
      headers: { "x-api-key": options.apiKey },
      signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    });
  } catch (error) {
    throw new RecipeUsageUnavailableError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new RecipeUsageUnavailableError(`menu-service answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as Partial<RecipeUsage> | null;
  if (typeof body?.menuItems !== "number" || typeof body.removedDishes !== "number") throw new RecipeUsageUnavailableError("menu-service answer is not a usage count");
  return { menuItems: body.menuItems, removedDishes: body.removedDishes };
};

/** Process-wide check; reads the env variables on every call. */
export const menuUsageCheck: RecipeUsageCheck = (recipeId) => createMenuUsageCheck({
  baseUrl: process.env.MENU_SERVICE_URL || "http://localhost:4007",
  apiKey: process.env.INTERNAL_API_KEY,
})(recipeId);
