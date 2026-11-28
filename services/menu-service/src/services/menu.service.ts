import { MealType, PeriodType, Prisma, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { randomUUID } from "node:crypto";
import type { AiDish } from "./ai/gemini";
import {
  type DishSuggestion,
  type DishIngredient,
  DEFAULT_MEAL_COUNTS,
  type KhoItem,
  type MealCounts,
  pickReplacement,
  addToHistory,
  type MealHistory,
  REPEAT_WINDOW_DAYS,
  type SuggestRecipe,
  usableKho,
  vnDay,
  countForeign,
  type ForeignCount,
  isForeign,
  newForeignCount,
  addForeign,
  best,
  CALORIE_WEIGHT,
  evaluateRecipe,
  fitsMeal,
  varietyPool,
  withinForeignCap,
} from "./kho-suggest";
import { cuisineOf, mealTarget, planMeal, replanServings, RICE_SHARE, riceGrams, SLOT_WEIGHTS, type PickConstraint, type Slot } from "./meal-plan";
import { khoSnapshot, snapshotHash } from "./ai/ai-suggestions.service";
import { menuPeople, scaleIngredients } from "./portions";
import { conditionWarnings, familyAllergic, familyMealTarget, hasAllergen, type FamilyHealth, type HealthWarning } from "./family-health";

const prisma = new PrismaClient();

type JsonRecord = Record<string, unknown>;

export interface RecipeCandidate {
  id: string;
  name: string;
  /** Normalized plain names (older matching in autoRefreshMenu / constraints). */
  ingredients: string[];
  /** Structured ingredients (recipe-service ingredientDetails, else the plain names without quantity). */
  details: DishIngredient[];
  imageUrl: string | null;
  isActive: boolean;
  mealTypes: string[];
  dietaryTags: string[];
  tags: string[];
  calories?: number;
  role: string | null;
  /** People the recipe quantities are for (null = 1). */
  servings: number | null;
  /** recipe-service health tags (family allergy exclusion, condition warnings). */
  allergens: string[];
  contraindications: string[];
  /** recipe-service cuisine (vietnam / western / asian); null when not sent (older recipe-service). */
  cuisine: string | null;
}

interface GenerateMenuInput {
  userId: string;
  periodType: PeriodType;
  startDate: Date;
  endDate: Date;
  title?: string;
  preferences?: JsonRecord;
  constraints?: JsonRecord;
  recipes?: unknown[];
  /** Family whose Kho is read; without it the menu falls back to varied popular dishes. */
  familyId?: string;
  /** The caller's "Authorization" header, forwarded to inventory-service (it checks family membership). */
  authorization?: string;
  /** Kho items supplied directly (tests); otherwise read from inventory-service. */
  inventoryItems?: unknown[];
  /** Recipes the user removed in the last 7 days: not picked (unless nothing else fits a meal). */
  excludeRecipeIds?: string[];
  /** Already loaded recipes / Kho (several days generated in one request load them once). */
  preloaded?: { recipes: RecipeCandidate[]; khoItems: KhoItem[] };
  /** The caller's family (shared menu, replaced per family) or personal owner; without it, personal by userId. */
  owner?: MenuOwner;
  /** Members' allergies, conditions and meal targets (family-context.ts); without it no health rules apply. */
  health?: FamilyHealth;
}

interface AutoRefreshInput {
  inventoryItems: unknown[];
  recipes?: unknown[];
  health?: FamilyHealth;
}

interface ManualMenuInput {
  title: string;
  periodType: PeriodType;
  startDate: Date;
  endDate: Date;
  items: Array<{
    recipeId?: string;
    dishName: string;
    mealType: MealType;
    dayOfWeek: number;
    calories?: number;
  }>;
}

/**
 * Whose menus a request reads and writes. In a family, menus belong to the family (shared by every member, one active
 * menu per family, day and period); without a family the user keeps personal menus (read by userId, as before).
 */
export type MenuOwner = { userId: string; familyId: string | null; role?: string; memberCount?: number };
/** A plain userId means a personal owner (older callers and tests). */
export type OwnerArg = string | MenuOwner;
export const ownerOf = (owner: OwnerArg): MenuOwner => (typeof owner === "string" ? { userId: owner, familyId: null } : owner);
/** Active menus of the owner: the family's (archived duplicates left out) or the user's own. */
export function menuScope(owner: OwnerArg): Prisma.MenuWhereInput {
  const resolved = ownerOf(owner);
  return resolved.familyId ? { familyId: resolved.familyId, archived: false } : { userId: resolved.userId };
}
/** Prisma unique-constraint error (the partial index on family menus). */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

export class MenuServiceError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "MenuServiceError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const record = asRecord(item);
    return typeof record.name === "string" ? [record.name] : [];
  }).map(normalizeText).filter(Boolean);
}

function recipeListFromResponse(value: unknown, depth = 0): unknown[] {
  if (Array.isArray(value)) return value;
  if (depth > 3) return [];
  const record = asRecord(value);
  for (const key of ["recipes", "items", "data", "results"]) {
    if (record[key] !== undefined) {
      const result = recipeListFromResponse(record[key], depth + 1);
      if (result.length > 0) return result;
    }
  }
  return [];
}

function readDetails(value: unknown, fallback: unknown): DishIngredient[] {
  const source = Array.isArray(value) && value.length > 0 ? value : Array.isArray(fallback) ? fallback : [];
  return source.flatMap((entry): DishIngredient[] => {
    if (typeof entry === "string") return entry.trim() ? [{ name: entry.trim(), quantity: null, unit: null }] : [];
    const record = asRecord(entry);
    if (typeof record.name !== "string" || !record.name.trim()) return [];
    return [{
      name: record.name.trim(),
      quantity: typeof record.quantity === "number" && Number.isFinite(record.quantity) ? record.quantity : null,
      unit: typeof record.unit === "string" ? record.unit : null,
      note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
      isSeasoning: record.isSeasoning === true,
      ...(record.perPerson === true ? { perPerson: true } : {}),
    }];
  });
}

function normalizeRecipes(values: unknown[]): RecipeCandidate[] {
  return values.flatMap((value) => {
    const record = asRecord(value);
    let id: string | undefined;
    if (typeof record.id === "string") id = record.id;
    else if (typeof record.recipeId === "string") id = record.recipeId;
    if (!id) return [];
    const ingredients = readStringList(record.ingredients ?? record.ingredientNames);
    let name = id;
    if (typeof record.name === "string") name = record.name;
    else if (typeof record.dishName === "string") name = record.dishName;
    return [{
      id,
      name,
      ingredients,
      details: readDetails(record.ingredientDetails, record.ingredients ?? record.ingredientNames),
      imageUrl: typeof record.imageUrl === "string" && record.imageUrl ? record.imageUrl : null,
      isActive: record.isActive !== false,
      role: typeof record.role === "string" && record.role ? record.role : null,
      mealTypes: readStringList(record.mealTypes ?? record.suitableMealTypes),
      dietaryTags: readStringList(record.dietaryTags ?? record.diets),
      tags: readStringList(record.tags),
      calories: typeof record.calories === "number" && Number.isFinite(record.calories) ? record.calories : undefined,
      allergens: readStringList(record.allergens),
      contraindications: readStringList(record.contraindications),
      servings: typeof record.servings === "number" && Number.isFinite(record.servings) ? record.servings : null,
      cuisine: typeof record.cuisine === "string" && record.cuisine ? record.cuisine : null,
    }];
  });
}

const RECIPES_UNAVAILABLE = "Không tải được danh sách món ăn (recipe-service không phản hồi). Hãy thử lại sau.";
const NO_RECIPES = "Chưa có món ăn nào để gợi ý. Hãy thêm công thức trong recipe-service.";

/** Active recipes from recipe-service (or the supplied list). Unreachable or empty → 503 with a clear message. */
export async function getRecipes(suppliedRecipes?: unknown[]): Promise<RecipeCandidate[]> {
  let values = suppliedRecipes;
  if (values === undefined) {
    const baseUrl = (process.env.RECIPE_SERVICE_URL ?? "http://localhost:4006").replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/recipes?active=true`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new MenuServiceError(RECIPES_UNAVAILABLE, 503);
    }
    if (!response.ok) throw new MenuServiceError(RECIPES_UNAVAILABLE, 503);
    values = recipeListFromResponse(await response.json().catch(() => null));
  }
  const recipes = normalizeRecipes(values).filter((recipe) => recipe.isActive);
  if (recipes.length === 0) throw new MenuServiceError(NO_RECIPES, 503);
  return recipes;
}

const INVENTORY_UNAVAILABLE = "Không đọc được Kho (inventory-service không phản hồi). Hãy thử lại sau.";
const INVENTORY_PAGE_SIZE = 100;
const INVENTORY_MAX_PAGES = 10;

function readKhoItems(values: unknown[]): KhoItem[] {
  return values.flatMap((value): KhoItem[] => {
    if (typeof value === "string") return value.trim() ? [{ name: value.trim(), quantity: null, unit: null, expiryDate: null }] : [];
    const record = asRecord(value);
    const name = record.name ?? record.ingredientName ?? record.foodName;
    if (typeof name !== "string" || !name.trim()) return [];
    if (record.status === "CONSUMED" || record.status === "DISCARDED" || record.deletedAt) return [];
    return [{
      name: name.trim(),
      quantity: typeof record.quantity === "number" ? record.quantity : null,
      unit: typeof record.unit === "string" ? record.unit : null,
      expiryDate: typeof record.expiryDate === "string" ? record.expiryDate : null,
      productId: typeof record.productId === "string" && record.productId ? record.productId : null,
      status: typeof record.status === "string" ? record.status : null,
      ...(typeof record.deliveryOrderId === "string" && record.deliveryOrderId ? { pendingDelivery: true } : {}),
    }];
  });
}

/** The family's Kho (not used up / discarded) from inventory-service, with the caller's token. */
export async function getKhoItems(familyId: string, authorization?: string): Promise<KhoItem[]> {
  const baseUrl = (process.env.INVENTORY_API_URL ?? "http://localhost:4003").replace(/\/+$/, "");
  const items: unknown[] = [];
  for (let page = 1; page <= INVENTORY_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ familyId, page: String(page), limit: String(INVENTORY_PAGE_SIZE) });
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/inventory/items?${query}`, {
        headers: authorization ? { Authorization: authorization } : {},
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new MenuServiceError(INVENTORY_UNAVAILABLE, 503);
    }
    if (response.status === 401 || response.status === 403) {
      throw new MenuServiceError("Bạn không có quyền xem Kho của gia đình này.", 403);
    }
    if (!response.ok) throw new MenuServiceError(INVENTORY_UNAVAILABLE, 503);
    const body = asRecord(await response.json().catch(() => null));
    const pageItems = Array.isArray(body.items) ? body.items : [];
    items.push(...pageItems);
    const totalPages = Number(asRecord(body.pagination).totalPages ?? 1);
    if (pageItems.length < INVENTORY_PAGE_SIZE || page >= totalPages) break;
  }
  return readKhoItems(items);
}

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);

/** Calendar day of a stored menu item (menus store a weekday, counted from the menu's start date). */
export function itemDate(menuStart: Date, dayOfWeek: number): Date {
  const start = normalizeDate(menuStart);
  const startWeekday = ((start.getUTCDay() + 6) % 7) + 1;
  return addDays(start, (dayOfWeek - startWeekday + 7) % 7);
}

/** recipeIds by day (YYYY-MM-DD) for the days before `startDate`, from earlier menus of this family (or user). */
async function recentDishes(client: PrismaClient, owner: { userId: string; familyId?: string }, startDate: Date): Promise<Map<string, Set<string>>> {
  const byDay = new Map<string, Set<string>>();
  const from = addDays(startDate, -REPEAT_WINDOW_DAYS);
  try {
    const menus = await client.menu.findMany({
      where: {
        ...(owner.familyId ? { familyId: owner.familyId, archived: false } : { userId: owner.userId }),
        startDate: { lt: startDate },
        endDate: { gte: from },
      },
      include: { items: true },
    });
    for (const menu of menus) {
      for (const item of menu.items) {
        if (!item.recipeId) continue;
        const date = itemDate(menu.startDate, item.dayOfWeek);
        if (date < from || date >= startDate) continue;
        const key = dayKey(date);
        byDay.set(key, (byDay.get(key) ?? new Set<string>()).add(item.recipeId));
      }
    }
  } catch (error) {
    // History only adds a small penalty; the menu can still be generated without it.
    console.error("Generate Menu Error:", error);
  }
  return byDay;
}

/** Days around a menu that the variety rule looks at (a week before and after). */
const VARIETY_WINDOW_DAYS = 6;

/**
 * Dishes planned per meal on the days around [from, to] (saved menus before AND after), for the variety rule.
 * Days inside `skip` are left out (they are being generated now). Errors give an empty history.
 */
async function mealHistory(
  client: PrismaClient,
  owner: { userId: string; familyId?: string | null },
  from: Date,
  to: Date,
  skip?: { from: Date; to: Date },
): Promise<MealHistory> {
  const history: MealHistory = new Map();
  const windowStart = addDays(from, -VARIETY_WINDOW_DAYS);
  const windowEnd = addDays(to, VARIETY_WINDOW_DAYS);
  try {
    const menus = await client.menu.findMany({
      where: {
        ...(owner.familyId ? { familyId: owner.familyId, archived: false } : { userId: owner.userId }),
        startDate: { lte: windowEnd },
        endDate: { gte: windowStart },
      },
      include: { items: true },
    });
    for (const menu of menus ?? []) {
      for (const item of menu.items ?? []) {
        if (!item.recipeId) continue;
        const date = itemDate(menu.startDate, item.dayOfWeek);
        if (date < windowStart || date > windowEnd) continue;
        if (skip && date >= skip.from && date <= skip.to) continue;
        addToHistory(history, dayKey(date), item.mealType, item.recipeId);
      }
    }
  } catch (error) {
    console.error("Generate Menu Error:", error);
  }
  return history;
}

/**
 * Recipe as the Kho scorer sees it. With `people`, quantities are scaled to the people eating (portions.ts), so Kho
 * matching, "Có sẵn X/Y" and the missing list use the family's amounts; without it the recipe's own amounts.
 */
const toSuggestRecipe = (recipe: RecipeCandidate, people?: number): SuggestRecipe => ({
  id: recipe.id,
  name: recipe.name,
  imageUrl: recipe.imageUrl,
  calories: recipe.calories ?? null,
  mealTypes: recipe.mealTypes,
  tags: recipe.tags,
  // Seasonings are not matched against Kho: they never count for "Có sẵn X/Y", the score or the missing list.
  ingredients: (people === undefined ? recipe.details : scaleIngredients(recipe.details, recipe.servings, people)).filter((detail) => !detail.isSeasoning),
  role: recipe.role,
  allergens: recipe.allergens,
  contraindications: recipe.contraindications,
  cuisine: recipe.cuisine,
});

/** Foreign dishes among saved menu items, by recipe id (AI dishes and unknown recipes count as Vietnamese). */
function foreignInItems(items: Array<{ recipeId: string | null; mealType: string }>, recipes: RecipeCandidate[]): ForeignCount {
  const cuisine = new Map(recipes.map((recipe) => [recipe.id, recipe.cuisine]));
  return countForeign(items.map((item) => ({ meal: item.mealType, foreign: item.recipeId ? isForeign({ cuisine: cuisine.get(item.recipeId) }) : false })));
}

/** All ingredients (seasonings included) count for allergies. */
const healthView = (recipe: RecipeCandidate) => ({ ingredients: recipe.details, allergens: recipe.allergens, contraindications: recipe.contraindications });

/**
 * Family health rules on the recipe list: dishes any member is allergic to are dropped everywhere; the rest is split
 * into dishes suitable for everyone (used first) and dishes unsuitable for some member (only when a slot cannot be
 * filled otherwise; they then carry warnings). Without health data every dish is "suitable".
 */
function splitCandidates(recipes: RecipeCandidate[], health?: FamilyHealth): { suitable: RecipeCandidate[]; fallback: RecipeCandidate[] } {
  if (!health || health.members.length === 0) return { suitable: recipes, fallback: [] };
  const safe = recipes.filter((recipe) => !familyAllergic(healthView(recipe), health));
  const unsuitable = new Set(safe.filter((recipe) => conditionWarnings(healthView(recipe), health).length > 0).map((recipe) => recipe.id));
  return { suitable: safe.filter((recipe) => !unsuitable.has(recipe.id)), fallback: safe.filter((recipe) => unsuitable.has(recipe.id)) };
}

/** Role slots still open after `picks` (each pick fills one slot of its role). */
function openRoles(roles: string[], picks: Array<{ role: string }>): string[] {
  const filled = picks.map((pick) => pick.role);
  return roles.filter((role) => {
    const at = filled.indexOf(role);
    if (at < 0) return true;
    filled.splice(at, 1);
    return false;
  });
}

/** Suggestion details stored on a menu item (Kho match, role and, for an unsuitable dish, warnings and an alternative). */
function itemDetails(
  suggestion: DishSuggestion,
  role: string | null,
  health?: { warnings: HealthWarning[]; alternative: DishSuggestion | null },
  portion?: { servings: number; mealTarget?: number; riceKcal?: number },
): Prisma.InputJsonValue {
  return {
    // Planned portions ("phần") of this dish: Lịch / Nấu ăn, cooking and "Cần mua tuần này" scale by them.
    ...(portion ? { servings: portion.servings } : {}),
    ...(portion?.mealTarget !== undefined ? { mealTarget: portion.mealTarget, riceKcal: portion.riceKcal ?? 0 } : {}),
    // "Kèm cơm trắng": the meal's rice as raw Gạo (only on the dish that carries the meal's rice: its món mặn).
    ...(portion?.riceKcal ? { riceGrams: riceGrams(portion.riceKcal) } : {}),
    imageUrl: suggestion.recipe.imageUrl,
    availableIngredients: suggestion.availableIngredients,
    missingIngredients: suggestion.missingIngredients,
    availableCount: suggestion.availableCount,
    totalCount: suggestion.totalCount,
    reason: suggestion.reason,
    role,
    ...(health && health.warnings.length > 0 ? {
      warnings: health.warnings,
      alternative: health.alternative
        ? { recipeId: health.alternative.recipe.id, dishName: health.alternative.recipe.name, imageUrl: health.alternative.recipe.imageUrl }
        : null,
    } : {}),
  } as Prisma.InputJsonValue;
}

/** Warnings for an unsuitable dish plus one suitable alternative for the same meal (any role, not already in the day). */
function healthNote(
  pick: DishSuggestion,
  meal: string,
  context: { health?: FamilyHealth; suitable: SuggestRecipe[]; kho: KhoItem[]; today: string; day: string; usedIds: ReadonlySet<string> },
): { warnings: HealthWarning[]; alternative: DishSuggestion | null } | undefined {
  if (!context.health) return undefined;
  const warnings = conditionWarnings(pick.recipe, context.health);
  if (warnings.length === 0) return undefined;
  const alternative = pickReplacement(context.suitable, context.kho, meal, null, {
    today: context.today, day: context.day, excludeIds: new Set([...context.usedIds, pick.recipe.id]),
  });
  return { warnings, alternative };
}

function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function datesInRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const date = normalizeDate(startDate);
  const finalDate = normalizeDate(endDate);
  while (date <= finalDate) {
    dates.push(new Date(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

function inventoryNames(items: unknown[]): string[] {
  return items.flatMap((item) => {
    if (typeof item === "string") return [normalizeText(item)];
    const record = asRecord(item);
    const name = record.name ?? record.ingredientName ?? record.foodName;
    return typeof name === "string" ? [normalizeText(name)] : [];
  }).filter(Boolean);
}

function matchesAny(ingredients: string[], values: string[]): boolean {
  return ingredients.some((ingredient) => values.some((value) =>
    ingredient === value || ingredient.includes(value) || value.includes(ingredient)
  ));
}

function chooseRecipe(
  recipes: RecipeCandidate[],
  mealType: MealType,
  preferences: JsonRecord,
  constraints: JsonRecord,
  availableIngredients: string[] = [],
  excludedIds: Set<string> = new Set(),
): RecipeCandidate {
  const avoidIngredients = readStringList(constraints.avoidIngredients);
  const requiredIngredients = readStringList(constraints.requiredIngredients);
  const requiredDiets = readStringList(constraints.dietaryTags);
  const preferredIngredients = readStringList(preferences.preferredIngredients);
  const preferredDiets = readStringList(preferences.dietaryTags);
  const mealName = mealType.toLocaleLowerCase();
  const suitable = recipes.filter((recipe) => {
    if (recipe.mealTypes.length > 0 && !recipe.mealTypes.includes(mealName)) return false;
    if (matchesAny(recipe.ingredients, avoidIngredients)) return false;
    if (!requiredIngredients.every((ingredient) => recipe.ingredients.includes(ingredient))) return false;
    return requiredDiets.every((diet) => recipe.dietaryTags.includes(diet));
  });
  const candidates = suitable.filter((recipe) => !excludedIds.has(recipe.id));
  const pool = candidates.length > 0 ? candidates : suitable;
  if (pool.length === 0) {
    throw new MenuServiceError(`No recipes satisfy the constraints for ${mealType}`, 422);
  }

  const calorieTargets: Record<MealType, number> = {
    [MealType.BREAKFAST]: 350,
    [MealType.LUNCH]: 550,
    [MealType.DINNER]: 500,
    [MealType.SNACK]: 180,
  };
  const scoreRecipe = (recipe: RecipeCandidate): number => recipe.ingredients.filter((ingredient) =>
      availableIngredients.some((available) => ingredient === available || ingredient.includes(available) || available.includes(ingredient))
    ).length * 5
      + recipe.ingredients.filter((ingredient) => preferredIngredients.includes(ingredient)).length * 3
      + recipe.dietaryTags.filter((diet) => preferredDiets.includes(diet)).length * 2
      + recipe.tags.filter((tag) => preferredDiets.includes(tag)).length
      - (recipe.calories === undefined ? 0 : Math.abs(recipe.calories - calorieTargets[mealType]) / 100);

  return pool.reduce((best, recipe) => scoreRecipe(recipe) > scoreRecipe(best) ? recipe : best, pool[0]);
}

function selectedMealTypes(preferences: JsonRecord): MealType[] {
  const validTypes = new Set<string>(Object.values(MealType));
  const requested = readStringList(preferences.mealTypes)
    .map((value) => value.toUpperCase())
    .filter((value): value is MealType => validTypes.has(value));
  return requested.length > 0 ? [...new Set(requested)] : [
    MealType.BREAKFAST,
    MealType.LUNCH,
    MealType.DINNER,
  ];
}

const FIT_WEIGHT = CALORIE_WEIGHT / 2;

/**
 * Variety windows (days before AND after `day`, any meal; the saved days around and the days generated earlier in
 * the same request are in `history`):
 * - a main (món mặn / một món, lunch or dinner): not planned within ±6 days (no repeat in 7 days),
 * - a canh / rau / side: not within ±2 days (no repeat in 3 days),
 * - a breakfast dish: not within ±3 days (4 days), and not the same family (bánh mì, bún, phở, xôi, cháo, mì…) on
 *   the day before or after.
 * Relaxed only when the catalog cannot satisfy them, in this order: (1) all rules, (2) without the breakfast family
 * rule, (3) half the window, (4) only not on the day before / after, (5) anything not already in the day.
 */
export const VARIETY_WINDOWS = { main: 6, side: 2, breakfast: 3 } as const;
const FAMILY_PREFIXES = ["banh mi", "banh cuon", "banh canh", "hu tieu", "bun", "pho", "xoi", "chao", "mi", "com"];
/** "Bánh mì chảo" / "Bánh mì trứng ốp la" → "banh mi"; dishes outside the known families are their own family. */
export function dishFamily(name: string): string {
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
  return FAMILY_PREFIXES.find((prefix) => key === prefix || key.startsWith(`${prefix} `)) ?? key;
}

export function variedCandidates(
  open: SuggestRecipe[],
  context: { meal: string; slot: Slot; day: string; history: MealHistory; familyOf?: (recipeId: string) => string },
): SuggestRecipe[] {
  const breakfast = context.meal.toUpperCase() === "BREAKFAST";
  const window = breakfast ? VARIETY_WINDOWS.breakfast : context.slot === "main" || context.slot === "one_dish" ? VARIETY_WINDOWS.main : VARIETY_WINDOWS.side;
  const familyOf = context.familyOf ?? ((id: string) => id);
  const nearFamilies = new Set<string>();
  if (breakfast) {
    const start = Date.parse(`${context.day}T00:00:00Z`);
    for (const offset of [-1, 1]) {
      const other = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
      context.history.get(`${other}|BREAKFAST`)?.forEach((id) => nearFamilies.add(familyOf(id)));
    }
  }
  const tiers: Array<{ window: number; family: boolean }> = [
    { window, family: breakfast },
    { window, family: false },
    { window: Math.ceil(window / 2), family: false },
    { window: 1, family: false },
  ];
  // Relaxed tiers spread the unavoidable repeats: only the dishes used least often in the surrounding week stay.
  const leastUsed = (list: SuggestRecipe[]) => {
    const uses = list.map((recipe) => usesAnyMeal(context.history, context.day, recipe.id, VARIETY_WINDOWS.main));
    const fewest = Math.min(...uses);
    return list.filter((_, index) => uses[index] === fewest);
  };
  for (const [index, tier] of tiers.entries()) {
    const fits = open.filter((recipe) => usesAnyMeal(context.history, context.day, recipe.id, tier.window) === 0
      && (!tier.family || !nearFamilies.has(familyOf(recipe.id))));
    if (fits.length > 0) return index === 0 ? fits : leastUsed(fits);
  }
  return open.length > 0 ? leastUsed(open) : open;
}
const PLANNED_MEALS = ["BREAKFAST", "LUNCH", "DINNER"];
/** Times a recipe is planned in any meal within `distance` days before or after `day` (the day itself excluded). */
function usesAnyMeal(history: MealHistory, day: string, recipeId: string, distance: number): number {
  let count = 0;
  const start = Date.parse(`${day}T00:00:00Z`);
  for (let offset = -distance; offset <= distance; offset += 1) {
    if (offset === 0) continue;
    const other = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
    for (const meal of PLANNED_MEALS) if (history.get(`${other}|${meal}`)?.has(recipeId)) count += 1;
  }
  return count;
}

/** Rough kcal a slot is meant to carry (for the "natural portion" tie-break below). */
function slotShare(slot: Slot, goal: number): number {
  const dishes = goal * (slot === "main" || slot === "veg" || slot === "side" ? 1 - RICE_SHARE : 1);
  if (slot === "main") return dishes * (SLOT_WEIGHTS.main / (SLOT_WEIGHTS.main + SLOT_WEIGHTS.veg));
  if (slot === "veg") return dishes * (SLOT_WEIGHTS.veg / (SLOT_WEIGHTS.main + SLOT_WEIGHTS.veg));
  if (slot === "side") return dishes * SLOT_WEIGHTS.side;
  if (slot === "drink") return dishes * SLOT_WEIGHTS.drink;
  return dishes;
}

/**
 * One dish for a planner slot: recipes of the slot's roles that fit the meal, not already in the day, within the
 * cuisine caps; variety first, then the Kho score (coverage, expiring items), with a small tie-break for dishes whose
 * natural portion is about one serving per person. Recently removed dishes are skipped unless nothing else fits; then
 * dishes unsuitable for a member (they carry warnings); allergens are never in the pools.
 */
/** At lunch / dinner a one-plate dish competes with món mặn, a little behind, so rice meals stay the norm. */
const ONE_PLATE_MAIN_PENALTY = 8;

function pickForSlot(input: {
  meal: string; roles: Array<string | null>; slot: Slot; goal: number; people: number; constraint?: PickConstraint;
  pool: SuggestRecipe[]; fallbackPool: SuggestRecipe[]; kho: KhoItem[]; today: string; day: string;
  recentRecipeIds: ReadonlySet<string>; usedIds: Set<string>; excludeIds: ReadonlySet<string>; history: MealHistory; foreign: ForeignCount;
  /** Breakfast "family" of a recipe id (bánh mì, bún, phở…), for the breakfast rotation. */
  familyOf?: (recipeId: string) => string;
}): DishSuggestion | null {
  const constraint = input.constraint ?? {};
  // A side that accompanies a foreign main is part of that one foreign meal: it does not count against the caps.
  const accompaniesForeign = constraint.cuisine !== undefined && constraint.cuisine !== "vietnam";
  // Half the old calorie weight: Kho and variety decide, the natural portion only breaks close calls.
  const penalty = (recipe: SuggestRecipe): number => {
    const onePlate = input.slot === "main" && recipe.role === "mot_mon";
    const share = onePlate ? input.goal : slotShare(input.slot, input.goal);
    if (share <= 0) return onePlate ? ONE_PLATE_MAIN_PENALTY : 0;
    // A dish with (almost) no energy cannot carry a slot meant to add kcal (green tea as the breakfast drink).
    if (!recipe.calories || recipe.calories < 10) return FIT_WEIGHT;
    return FIT_WEIGHT * Math.min(1, Math.abs(share / recipe.calories / input.people - 1)) + (onePlate ? ONE_PLATE_MAIN_PENALTY : 0);
  };
  const choose = (source: SuggestRecipe[], exclude: ReadonlySet<string>): DishSuggestion | null => {
    const open = source.filter((recipe) => fitsMeal(recipe, input.meal) && !input.usedIds.has(recipe.id) && !exclude.has(recipe.id)
      && (accompaniesForeign || withinForeignCap(recipe, input.foreign, input.meal)) && input.roles.includes(recipe.role ?? null)
      && (constraint.cuisine === undefined || cuisineOf(recipe.cuisine) === constraint.cuisine)
      && (constraint.maxKcal === undefined || (recipe.calories ?? 0) <= constraint.maxKcal));
    const varied = variedCandidates(open, { meal: input.meal, slot: input.slot, day: input.day, history: input.history, familyOf: input.familyOf });
    return best(varied, input.kho, { today: input.today, recentRecipeIds: input.recentRecipeIds },
      `${input.day}:${input.meal.toLowerCase()}:${input.slot}`, penalty);
  };
  const none = new Set<string>();
  // Optional dishes (a side, a breakfast drink) only come from dishes suitable for everyone.
  const optional = input.slot === "side" || input.slot === "drink";
  const pick = choose(input.pool, input.excludeIds) ?? choose(input.pool, none)
    ?? (optional ? null : choose(input.fallbackPool, input.excludeIds) ?? choose(input.fallbackPool, none));
  if (!pick) return null;
  input.usedIds.add(pick.recipe.id);
  if (isForeign(pick.recipe) && !accompaniesForeign) addForeign(input.foreign, input.meal);
  return pick;
}

export async function generateMenu(rawInput: GenerateMenuInput, client: PrismaClient = prisma) {
  const ownerFamily = rawInput.owner?.familyId ?? null;
  // A family menu always uses the family's own Kho.
  const input = ownerFamily ? { ...rawInput, familyId: ownerFamily } : rawInput;
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  if (endDate < startDate) {
    throw new MenuServiceError("endDate must be on or after startDate", 400);
  }

  const preferences = input.preferences ?? {};
  const constraints = input.constraints ?? {};
  const mealTypes = selectedMealTypes(preferences);
  const today = vnDay();
  // Recipes and Kho in parallel; either upstream down → MenuServiceError 503 (no menu is written).
  const [recipes, khoItems] = input.preloaded ? [input.preloaded.recipes, input.preloaded.khoItems] : await Promise.all([
    getRecipes(input.recipes),
    input.inventoryItems !== undefined
      ? Promise.resolve(readKhoItems(input.inventoryItems))
      : input.familyId ? getKhoItems(input.familyId, input.authorization) : Promise.resolve([]),
  ]);
  const kho = usableKho(khoItems, today);
  // Hash of the Kho snapshot these suggestions used (only when a Kho was read); the app compares it with the
  // current Kho hash to regenerate a stale menu for today.
  const khoHash = input.familyId || input.inventoryItems !== undefined || input.preloaded ? snapshotHash(khoSnapshot(khoItems, today)) : null;
  // Constraints from the request (avoid / required ingredients, diets) still filter the pool.
  const constrained = recipes.filter((recipe) => {
    const avoid = readStringList(constraints.avoidIngredients);
    const required = readStringList(constraints.requiredIngredients);
    const diets = readStringList(constraints.dietaryTags);
    return !matchesAny(recipe.ingredients, avoid)
      && required.every((ingredient) => recipe.ingredients.includes(ingredient))
      && diets.every((diet) => recipe.dietaryTags.includes(diet));
  });
  // Family health: allergens never; dishes unsuitable for a member only when a slot cannot be filled otherwise.
  const split = splitCandidates(constrained, input.health);
  // Quantities for the people eating: the family's member count (personal menus: 1).
  const people = input.owner ? menuPeople(ownerFamily ? input.owner.memberCount : 1) : undefined;
  const pool = split.suitable.map((recipe) => toSuggestRecipe(recipe, people));
  const fallbackPool = split.fallback.map((recipe) => toSuggestRecipe(recipe, people));
  if (pool.length === 0 && fallbackPool.length === 0) throw new MenuServiceError("Không có món nào phù hợp với yêu cầu.", 422);
  // People eating (portions start from one per person): the family's member count, else the known members, else 1.
  const eaters = people ?? Math.max(1, input.health?.members.length ?? 1);
  const candidateById = new Map(constrained.map((recipe) => [recipe.id, recipe]));
  // Breakfast rotation: the "family" of every known recipe (dishes on saved days included).
  const families = new Map(recipes.map((recipe) => [recipe.id, dishFamily(recipe.name)]));
  const familyOf = (recipeId: string) => families.get(recipeId) ?? recipeId;

  const history = await recentDishes(client, { userId: input.userId, familyId: input.familyId }, startDate);
  // Variety: the same meal on the days before and after (saved menus), plus the days generated in this request.
  const variety = await mealHistory(client, { userId: input.userId, familyId: input.familyId }, startDate, endDate, { from: startDate, to: endDate });
  const scheduledWeekdays = new Set<number>();
  const items: Array<{
    recipeId: string | null;
    dishName: string;
    mealType: MealType;
    dayOfWeek: number;
    calories: number | null;
    details: Prisma.InputJsonValue;
  }> = [];

  for (const date of datesInRange(startDate, endDate)) {
    const dayOfWeek = ((date.getUTCDay() + 6) % 7) + 1;
    if (scheduledWeekdays.has(dayOfWeek)) continue;
    scheduledWeekdays.add(dayOfWeek);
    const recentRecipeIds = new Set<string>();
    for (let back = 1; back <= REPEAT_WINDOW_DAYS; back += 1) {
      history.get(dayKey(addDays(date, -back)))?.forEach((id) => recentRecipeIds.add(id));
    }
    const chosenToday = new Set<string>();
    const foreignToday = newForeignCount();
    const excludeIds = new Set(input.excludeRecipeIds ?? []);
    // Calorie-based planner (meal-plan.ts): dishes per meal and their portions from the family's kcal target.
    {
      for (const meal of mealTypes) {
        const goal = mealTarget(input.health, meal, eaters);
        const plan = planMeal(meal, eaters, goal, (roles, slot, constraint) => {
          const pick = pickForSlot({ meal, roles, slot, goal, people: eaters, constraint, pool, fallbackPool, kho, today, day: dayKey(date), recentRecipeIds, usedIds: chosenToday, excludeIds, history: variety, foreign: foreignToday, familyOf });
          return pick ? { value: pick, role: pick.recipe.role ?? null, kcal: pick.recipe.calories, cuisine: pick.recipe.cuisine } : null;
        });
        plan.dishes.forEach((dish, index) => {
          const recipe = candidateById.get(dish.pick.recipe.id);
          // Stored Kho match and missing list for the planned portions (not the whole family's default amounts).
          const scaled = recipe ? evaluateRecipe(toSuggestRecipe(recipe, dish.servings), kho, today, recentRecipeIds, `${dayKey(date)}:${meal.toLowerCase()}`) : dish.pick;
          const suggestion = { ...scaled, reason: scaled.reason };
          addToHistory(variety, dayKey(date), meal, dish.pick.recipe.id);
          items.push({
            recipeId: dish.pick.recipe.id,
            dishName: dish.pick.recipe.name,
            mealType: meal as MealType,
            dayOfWeek,
            calories: dish.pick.recipe.calories,
            details: itemDetails(suggestion, dish.pick.recipe.role ?? null,
              healthNote(dish.pick, meal, { health: input.health, suitable: pool, kho, today, day: dayKey(date), usedIds: chosenToday }),
              { servings: dish.servings, ...(index === 0 ? { mealTarget: plan.target, riceKcal: plan.riceKcal } : {}) }),
          });
        });
      }
    }
    // Later days of the same request also avoid repeating these.
    history.set(dayKey(date), chosenToday);
  }
  if (items.length === 0) throw new MenuServiceError("Không có món nào phù hợp với các bữa đã chọn.", 422);

  const defaultTitle = `${input.periodType.toLocaleLowerCase()} menu starting ${startDate.toISOString().slice(0, 10)}`;
  const title = input.title?.trim() || defaultTitle;
  const data = {
    userId: input.userId,
    familyId: input.familyId ?? null,
    // Cooked for everyone in the family (member count now); personal menus for one.
    servings: ownerFamily ? input.owner?.memberCount ?? null : 1,
    // No family health data has ever been loaded: allergies unknown, the app shows a notice on Lịch.
    healthUnavailable: input.health?.missing === true,
    khoHash,
    title,
    periodType: input.periodType,
    startDate,
    endDate,
  };
  try {
    // "Làm mới theo kho": the new suggestion replaces the family's (or, without a family, this user's) menu for the
    // same period and dates.
    const replaced = ownerFamily
      ? { familyId: ownerFamily, archived: false, periodType: input.periodType, startDate, endDate }
      : { userId: input.userId, periodType: input.periodType, startDate, endDate };
    return await client.$transaction(async (tx) => {
      await tx.menu.deleteMany({ where: replaced });
      return tx.menu.create({ data: { ...data, items: { create: items } }, include: { items: true } });
    });
  } catch (error) {
    // Two members generated the same family day at once: the unique index let the other one win; return it.
    if (ownerFamily && isUniqueViolation(error)) {
      const winner = await client.menu.findFirst({
        where: { familyId: ownerFamily, archived: false, periodType: input.periodType, startDate },
        include: { items: true },
      });
      if (winner) return winner;
    }
    console.error("Generate Menu Error:", error);
    const id = randomUUID();
    const now = new Date();
    return {
      id,
      ...data,
      items: items.map((item) => ({ ...item, id: randomUUID(), menuId: id, createdAt: now, updatedAt: now })),
      createdAt: now,
      updatedAt: now,
      persisted: false,
    };
  }
}

/** Hash of the family's current Kho (same snapshot hash that generateMenu stores on the menu). */
export async function currentKhoHash(familyId: string, authorization?: string): Promise<string> {
  return snapshotHash(khoSnapshot(await getKhoItems(familyId, authorization)));
}

export function createManualMenu(ownerArg: OwnerArg, input: ManualMenuInput, client: PrismaClient = prisma) {
  const owner = ownerOf(ownerArg);
  const userId = owner.userId;
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  if (endDate < startDate) {
    throw new MenuServiceError("endDate must be on or after startDate", 400);
  }
  return client.menu.create({
    data: {
      userId,
      ...(owner.familyId ? { familyId: owner.familyId, servings: owner.memberCount ?? null } : {}),
      title: input.title.trim(),
      periodType: input.periodType,
      startDate,
      endDate,
      items: {
        create: input.items.map((item) => ({
          ...item,
          recipeId: item.recipeId ?? null,
          calories: item.calories ?? null,
        })),
      },
    },
    include: { items: true },
  });
}

/** The owner's menus (family or personal); with `from`/`to` only those overlapping that range (one request per view). */
export function listMenus(owner: OwnerArg, client: PrismaClient = prisma, range?: { from: Date; to: Date }) {
  const scope = menuScope(owner);
  return client.menu.findMany({
    where: range ? { ...scope, startDate: { lte: range.to }, endDate: { gte: range.from } } : scope,
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

/** One menu of the owner; archived family menus stay readable by id (history). */
export function findMenu(ownerArg: OwnerArg, id: string, client: PrismaClient = prisma) {
  const owner = ownerOf(ownerArg);
  return client.menu.findFirst({ where: owner.familyId ? { id, familyId: owner.familyId } : { id, userId: owner.userId }, include: { items: true } });
}

export async function deleteMenu(owner: OwnerArg, id: string, client: PrismaClient = prisma): Promise<boolean> {
  const result = await client.menu.deleteMany({ where: { id, ...menuScope(owner) } });
  return result.count > 0;
}

export async function autoRefreshMenu(owner: OwnerArg, input: AutoRefreshInput, client: PrismaClient = prisma) {
  const split = splitCandidates(await getRecipes(input.recipes), input.health);
  const recipes = split.suitable.length > 0 ? split.suitable : split.fallback;
  if (recipes.length === 0) throw new MenuServiceError("Không có món nào phù hợp với gia đình.", 422);
  const available = inventoryNames(input.inventoryItems);
  if (available.length === 0) {
    throw new MenuServiceError("inventoryItems must contain ingredient names", 400);
  }

  const activeMenus = await client.menu.findMany({
    where: menuScope(owner),
    include: { items: true },
  });
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const replacements: Array<{ menuId: string; menuItemId: string; fromRecipeId: string | null; toRecipeId: string }> = [];
  const updates: Array<ReturnType<typeof prisma.menuItem.update>> = [];

  for (const menu of activeMenus) {
    for (const item of menu.items) {
      const current = item.recipeId ? recipeById.get(item.recipeId) : undefined;
      const alternative = chooseRecipe(recipes, item.mealType, {}, {}, available);
      const score = (recipe?: RecipeCandidate) => recipe?.ingredients.filter((ingredient) =>
        available.some((name) => ingredient === name || ingredient.includes(name) || name.includes(ingredient))
      ).length ?? 0;
      if (alternative.id !== item.recipeId && score(alternative) > score(current)) {
        updates.push(client.menuItem.update({
          where: { id: item.id },
          data: {
            recipeId: alternative.id,
            dishName: alternative.name,
            calories: alternative.calories ?? null,
          },
        }));
        replacements.push({
          menuId: menu.id,
          menuItemId: item.id,
          fromRecipeId: item.recipeId,
          toRecipeId: alternative.id,
        });
      }
    }
  }

  if (updates.length > 0) await client.$transaction(updates);
  return { scannedMenus: activeMenus.length, replacements };
}

const DISLIKE_DAYS = 7;
const AI_MEAL: Record<string, string> = { BREAKFAST: "sang", LUNCH: "trua", DINNER: "toi" };

/** Vietnam day of a stored menu date is the UTC date part (menus store days at UTC midnight). */
export const isPastDay = (date: Date, now: Date = new Date()): boolean => dayKey(normalizeDate(date)) < vnDay(now);

/** "Số món mỗi bữa" of the family (or, without a family, of the user); defaults 3 / 5 / 5. */
export async function getMenuSettings(ownerArg: OwnerArg, client: PrismaClient = prisma): Promise<MealCounts> {
  const owner = ownerOf(ownerArg);
  const row = owner.familyId
    ? await client.familyMenuSettings.findUnique({ where: { familyId: owner.familyId } })
    : await client.menuSettings.findUnique({ where: { userId: owner.userId } });
  return row ? { BREAKFAST: row.breakfast, LUNCH: row.lunch, DINNER: row.dinner } : { ...DEFAULT_MEAL_COUNTS };
}

/** Everyone can read the family's "Số món mỗi bữa"; only the family OWNER changes it (personal users change their own). */
export const canEditMenuSettings = (ownerArg: OwnerArg): boolean => {
  const owner = ownerOf(ownerArg);
  return !owner.familyId || owner.role === "OWNER";
};

export async function updateMenuSettings(ownerArg: OwnerArg, counts: { breakfast: number; lunch: number; dinner: number }, client: PrismaClient = prisma): Promise<MealCounts> {
  const owner = ownerOf(ownerArg);
  if (!canEditMenuSettings(owner)) throw new MenuServiceError("Chỉ chủ gia đình có thể thay đổi số món mỗi bữa.", 403);
  const row = owner.familyId
    ? await client.familyMenuSettings.upsert({ where: { familyId: owner.familyId }, create: { familyId: owner.familyId, ...counts }, update: counts })
    : await client.menuSettings.upsert({ where: { userId: owner.userId }, create: { userId: owner.userId, ...counts }, update: counts });
  return { BREAKFAST: row.breakfast, LUNCH: row.lunch, DINNER: row.dinner };
}

/** Recipes and dish names removed in the last 7 days (dislike history): by any family member, else by the user. */
export async function recentlyRemoved(ownerArg: OwnerArg, client: PrismaClient = prisma, now: Date = new Date()): Promise<{ recipeIds: Set<string>; names: Set<string> }> {
  const owner = ownerOf(ownerArg);
  const who = owner.familyId ? { familyId: owner.familyId } : { userId: owner.userId };
  const rows = await client.removedDish.findMany({ where: { ...who, removedAt: { gte: addDays(now, -DISLIKE_DAYS) } } });
  return {
    recipeIds: new Set(rows.flatMap((row) => (row.recipeId ? [row.recipeId] : []))),
    names: new Set(rows.map((row) => normalizeText(row.dishName))),
  };
}

type RemoveInput = {
  userId: string;
  /** The caller's family or personal owner; without it, personal by userId. */
  owner?: MenuOwner;
  menuId: string;
  itemId: string;
  authorization?: string;
  now?: Date;
  /** Recipes supplied directly (tests); otherwise the active recipes from recipe-service. */
  recipes?: unknown[];
  /** Kho supplied directly (tests); otherwise read from inventory-service for the menu's family. */
  inventoryItems?: unknown[];
  /** Stored AI suggestions for the family (fallback when no catalog dish fits the slot). */
  aiDishes?: (familyId: string, kho: KhoItem[]) => Promise<AiDish[]>;
  /** Members' allergies / conditions (family-context.ts). */
  health?: FamilyHealth;
};

/**
 * Removes one dish from a (today or future) day menu and puts ONE replacement in the same meal and role: the best
 * Kho-scored catalog dish not already in the day, not removed by the user in the last 7 days and not hidden.
 * If no catalog dish fits, an AI suggestion for that meal fills the slot; otherwise the slot stays empty.
 * The removed dish is stored in the user's dislike history. Past days cannot be edited.
 */
export async function removeMenuItem(input: RemoveInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const owner = input.owner ?? ownerOf(input.userId);
  const menu = await client.menu.findFirst({ where: { id: input.menuId, ...menuScope(owner) }, include: { items: true } });
  if (!menu) throw new MenuServiceError("Menu not found", 404);
  if (isPastDay(menu.endDate, now)) throw new MenuServiceError("Không thể sửa thực đơn của ngày đã qua.", 422);
  const item = menu.items.find((entry) => entry.id === input.itemId);
  if (!item) throw new MenuServiceError("Món này không còn trong thực đơn.", 404);

  await client.removedDish.create({ data: { userId: input.userId, familyId: owner.familyId, recipeId: item.recipeId, dishName: item.dishName } });
  const removed = await recentlyRemoved(owner, client, now);

  const recipes = await getRecipes(input.recipes).catch(() => [] as RecipeCandidate[]);
  const khoItems = input.inventoryItems !== undefined
    ? readKhoItems(input.inventoryItems)
    : menu.familyId ? await getKhoItems(menu.familyId, input.authorization).catch(() => [] as KhoItem[]) : [];
  const today = vnDay(now);
  const kho = usableKho(khoItems, today);
  const details = asRecord(item.details);
  const role = typeof details.role === "string" ? details.role : null;
  const others = menu.items.filter((entry) => entry.id !== item.id);
  const excludeIds = new Set<string>([
    ...others.flatMap((entry) => (entry.recipeId ? [entry.recipeId] : [])),
    ...removed.recipeIds,
    ...(item.recipeId ? [item.recipeId] : []),
  ]);
  const day = dayKey(normalizeDate(menu.startDate));
  const history = await mealHistory(client, { userId: input.userId, familyId: menu.familyId }, normalizeDate(menu.startDate), normalizeDate(menu.startDate));
  const split = splitCandidates(recipes, input.health);
  // The menu's people (older menus: the current member count).
  const people = input.owner ? menuPeople(menu.servings, input.owner.familyId ? input.owner.memberCount : 1) : undefined;
  // Sensible combinations: the replacement matches the cuisine of the dishes left in the meal (a foreign main keeps
  // its same-cuisine side; a Vietnamese canh / rau / mặn keeps a Vietnamese partner). Nothing left: any cuisine.
  const cuisineById = new Map(recipes.map((recipe) => [recipe.id, cuisineOf(recipe.cuisine)]));
  const mealLeft = others.filter((entry) => entry.mealType === item.mealType && entry.dayOfWeek === item.dayOfWeek);
  const leftCuisines = mealLeft.map((entry) => (entry.recipeId ? cuisineById.get(entry.recipeId) ?? "vietnam" : "vietnam"));
  const requiredCuisine = leftCuisines.find((cuisine) => cuisine !== "vietnam") ?? (leftCuisines.length > 0 ? "vietnam" : undefined);
  const matches = (recipe: RecipeCandidate) => requiredCuisine === undefined || cuisineOf(recipe.cuisine) === requiredCuisine;
  const suitable = split.suitable.filter(matches).map((recipe) => toSuggestRecipe(recipe, people));
  // Foreign-dish caps: the other dishes of the same day (week menus: same weekday) count, the removed one does not.
  // A meal that is already a foreign meal (its other dish is foreign) is not counted again for its partner.
  const foreign = requiredCuisine !== undefined && requiredCuisine !== "vietnam"
    ? newForeignCount()
    : foreignInItems(others.filter((entry) => entry.dayOfWeek === item.dayOfWeek), recipes);
  // Suitable for everyone first; else a dish unsuitable for some member (with warnings); allergens never.
  const pick = pickReplacement(suitable, kho, item.mealType, role, { today, day, excludeIds, history, foreign })
    ?? pickReplacement(split.fallback.filter(matches).map((recipe) => toSuggestRecipe(recipe, people)), kho, item.mealType, role, { today, day, excludeIds, history, foreign });

  let replacement: Prisma.MenuItemUncheckedCreateInput | null = null;
  if (pick) {
    replacement = {
      menuId: menu.id,
      recipeId: pick.recipe.id,
      dishName: pick.recipe.name,
      mealType: item.mealType,
      dayOfWeek: item.dayOfWeek,
      calories: pick.recipe.calories,
      details: itemDetails(pick, role, healthNote(pick, item.mealType, { health: input.health, suitable, kho, today, day, usedIds: excludeIds })),
    };
  } else if (input.aiDishes && menu.familyId) {
    const dayNames = new Set(others.map((entry) => normalizeText(entry.dishName)));
    const allergies = input.health?.members.flatMap((member) => member.allergies) ?? [];
    const aiDishes = (await input.aiDishes(menu.familyId, khoItems).catch(() => [] as AiDish[]))
      .filter((dish) => !hasAllergen({ ingredients: dish.ingredients }, allergies));
    const aiPick = aiDishes.find((dish) => dish.mealType === AI_MEAL[item.mealType]
      && !dayNames.has(normalizeText(dish.name)) && !removed.names.has(normalizeText(dish.name)) && normalizeText(dish.name) !== normalizeText(item.dishName));
    if (aiPick) {
      replacement = {
        menuId: menu.id,
        recipeId: null,
        dishName: aiPick.name,
        mealType: item.mealType,
        dayOfWeek: item.dayOfWeek,
        calories: aiPick.calories ?? null,
        // Same warnings as catalog dishes (shown on the card and in the detail); no alternative for an AI dish.
        details: { ai: true, aiDish: aiPick, role, ...(aiPick.warnings?.length ? { warnings: aiPick.warnings, alternative: null } : {}) } as unknown as Prisma.InputJsonValue,
      };
    }
  }

  // Calorie-based menus: the meal's portions are sized again for its dishes now (the same kcal target; an AI dish too).
  const sameMeal = others.filter((entry) => entry.mealType === item.mealType && entry.dayOfWeek === item.dayOfWeek);
  const portionUpdates: Array<ReturnType<typeof client.menuItem.update>> = [];
  if (typeof details.servings === "number" || sameMeal.some((entry) => typeof asRecord(entry.details).servings === "number")) {
    const eaters = menuPeople(menu.servings, input.owner?.memberCount ?? null);
    const goal = mealTarget(input.health, item.mealType, eaters);
    const dishes = [
      ...sameMeal.map((entry) => ({ role: (asRecord(entry.details).role as string | null | undefined) ?? null, kcal: entry.calories, cuisine: entry.recipeId ? cuisineById.get(entry.recipeId) ?? null : null })),
      ...(replacement ? [{ role, kcal: replacement.calories ?? null, cuisine: replacement.recipeId ? cuisineById.get(replacement.recipeId) ?? null : null }] : []),
    ];
    const { servings, riceKcal } = replanServings(item.mealType, dishes, eaters, goal);
    // The meal's rice (and target) sits on its first món mặn; any other dish drops those keys.
    const holder = dishes.findIndex((dish) => dish.role === "man");
    const withPortion = (details: unknown, index: number): JsonRecord => {
      const { riceKcal: _rice, riceGrams: _grams, mealTarget: _target, ...rest } = asRecord(details);
      return { ...rest, servings: servings[index], ...(index === holder && riceKcal > 0 ? { mealTarget: goal, riceKcal, riceGrams: riceGrams(riceKcal) } : {}) };
    };
    sameMeal.forEach((entry, index) => {
      const next = withPortion(entry.details, index);
      if (JSON.stringify(next) === JSON.stringify(asRecord(entry.details))) return;
      portionUpdates.push(client.menuItem.update({ where: { id: entry.id }, data: { details: next as Prisma.InputJsonValue } }));
    });
    if (replacement) replacement.details = withPortion(replacement.details, servings.length - 1) as Prisma.InputJsonValue;
  }

  await client.$transaction([
    client.menuItem.delete({ where: { id: item.id } }),
    ...(replacement ? [client.menuItem.create({ data: replacement })] : []),
    ...portionUpdates,
  ]);
  return client.menu.findFirst({ where: { id: menu.id }, include: { items: true } });
}


const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MEALS = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER] as const;

type DaysInput = Omit<GenerateMenuInput, "periodType" | "startDate" | "endDate" | "preloaded"> & { days: string[]; now?: Date; replace?: boolean };

/**
 * Theo tuần: generates a DAY menu for each given day that is today or later and has no menu yet (one request,
 * same rules as a single day; Kho and recipes loaded once). Existing menus and past days are left as they are.
 * `replace` ("Tạo lại tuần", the family owner): today's and later days are generated again even when they have a
 * menu (each new day replaces the old one); past days still never change.
 */
export async function generateDays(input: DaysInput, client: PrismaClient = prisma) {
  const today = vnDay(input.now ?? new Date());
  const days = [...new Set(input.days)].filter((day) => DAY_PATTERN.test(day) && day >= today).sort();
  if (days.length === 0) return [];
  const existing = await client.menu.findMany({
    where: { ...menuScope(input.owner ?? input.userId), periodType: PeriodType.DAY, startDate: { in: days.map((day) => new Date(`${day}T00:00:00.000Z`)) } },
    select: { startDate: true },
  });
  const taken = new Set(input.replace ? [] : existing.map((menu) => dayKey(menu.startDate)));
  const missing = days.filter((day) => !taken.has(day));
  if (missing.length === 0) return [];
  const khoFamily = input.owner?.familyId ?? input.familyId;
  const [recipes, khoItems] = await Promise.all([
    getRecipes(input.recipes),
    input.inventoryItems !== undefined ? Promise.resolve(readKhoItems(input.inventoryItems))
      : khoFamily ? getKhoItems(khoFamily, input.authorization) : Promise.resolve([] as KhoItem[]),
  ]);
  const created = [];
  // One day after another, so each day sees the previous days and avoids repeating their dishes.
  for (const day of missing) {
    const date = new Date(`${day}T00:00:00.000Z`);
    created.push(await generateMenu({ ...input, periodType: PeriodType.DAY, startDate: date, endDate: date, preloaded: { recipes, khoItems } }, client));
  }
  return created;
}

type TopUpInput = { userId: string; owner?: MenuOwner; menuId: string; now?: Date };

/**
 * Kept for older app versions: the fixed-count upgrade of single-dish menus is gone (menus are calorie-based; saved
 * menus keep working as they are). Returns the menu unchanged; past days are refused (422) as before.
 */
export async function topUpMenu(input: TopUpInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const owner = input.owner ?? ownerOf(input.userId);
  const menu = await client.menu.findFirst({ where: { id: input.menuId, ...menuScope(owner) }, include: { items: true } });
  if (!menu) throw new MenuServiceError("Menu not found", 404);
  if (isPastDay(menu.endDate, now)) throw new MenuServiceError("Không thể sửa thực đơn của ngày đã qua.", 422);
  return menu;
}
