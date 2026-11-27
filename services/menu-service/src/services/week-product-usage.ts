import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { vnDay } from "./kho-suggest";
import { getRecipes, type RecipeCandidate } from "./menu.service";

/**
 * GET /internal/week-product-usage (admin-service "Giảm giá tự động"): for each ingredient name, in how many
 * households' menus it appears this week (Monday-Sunday, Vietnam days). Anonymous counts only: no user, family, menu
 * or dish ids leave this service. A household is the menu's family (or its creator for a personal menu); each counts
 * once per ingredient however many dishes use it. Seasonings are left out (salt, sauces: nobody buys them per dish).
 * Ingredients come from the recipe (by recipeId) and, for AI dishes, from the stored suggestion details.
 */
export type WeekProductUsage = { week: { from: string; to: string }; items: Array<{ name: string; households: number }> };

const normalizeName = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");

/** Monday and Sunday (YYYY-MM-DD) of the Vietnam week containing `now`. */
export const vnWeek = (now: Date = new Date()): { from: string; to: string } => {
  const today = new Date(`${vnDay(now)}T00:00:00.000Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
};

type DetailIngredient = { name?: unknown };
const namesFromDetails = (details: unknown): string[] => {
  const record = details && typeof details === "object" ? details as { availableIngredients?: unknown; missingIngredients?: unknown } : {};
  const available = Array.isArray(record.availableIngredients) ? record.availableIngredients.filter((value): value is string => typeof value === "string") : [];
  const missing = Array.isArray(record.missingIngredients) ? (record.missingIngredients as DetailIngredient[]).map((entry) => entry?.name).filter((value): value is string => typeof value === "string") : [];
  return [...available, ...missing];
};

/** Pure part (tests): menus of the week + recipes → names with household counts, most used first. */
export function countWeekUsage(
  menus: Array<{ familyId: string | null; userId: string; items: Array<{ recipeId: string | null; details: unknown }> }>,
  recipes: Array<Pick<RecipeCandidate, "id" | "details">>,
): Array<{ name: string; households: number }> {
  const byRecipe = new Map(recipes.map((recipe) => [recipe.id, recipe.details.filter((line) => !line.isSeasoning).map((line) => line.name)]));
  const households = new Map<string, Set<string>>();
  for (const menu of menus) {
    const household = menu.familyId ? `f:${menu.familyId}` : `u:${menu.userId}`;
    for (const item of menu.items) {
      const names = item.recipeId && byRecipe.has(item.recipeId) ? byRecipe.get(item.recipeId) ?? [] : namesFromDetails(item.details);
      for (const raw of names) {
        const name = normalizeName(raw);
        if (!name) continue;
        if (!households.has(name)) households.set(name, new Set());
        households.get(name)?.add(household);
      }
    }
  }
  return [...households].map(([name, set]) => ({ name, households: set.size })).sort((first, second) => second.households - first.households || first.name.localeCompare(second.name, "vi"));
}

export async function weekProductUsage(client: Pick<PrismaClient, "menu">, options: { now?: Date; recipes?: unknown[] } = {}): Promise<WeekProductUsage> {
  const week = vnWeek(options.now);
  const menus = await client.menu.findMany({
    where: { archived: false, startDate: { lte: new Date(`${week.to}T00:00:00.000Z`) }, endDate: { gte: new Date(`${week.from}T00:00:00.000Z`) } },
    select: { familyId: true, userId: true, items: { select: { recipeId: true, details: true } } },
  });
  if (menus.length === 0) return { week, items: [] };
  const recipes = await getRecipes(options.recipes).catch(() => [] as RecipeCandidate[]);
  return { week, items: countWeekUsage(menus, recipes) };
}
