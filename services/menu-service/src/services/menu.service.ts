import { MealType, PeriodType, Prisma, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { randomUUID } from "node:crypto";
import type { AiDish } from "./ai/gemini";
import {
  type DishSuggestion,
  type DishIngredient,
  DEFAULT_MEAL_COUNTS,
  type KhoItem,
  type MealCounts,
  pickDishes,
  pickMealDishes,
  pickReplacement,
  pickRoleDishes,
  roleSlots,
  addToHistory,
  type MealHistory,
  REPEAT_WINDOW_DAYS,
  type SuggestRecipe,
  usableKho,
  vnDay,
} from "./kho-suggest";
import { khoSnapshot, snapshotHash } from "./ai/ai-suggestions.service";

const prisma = new PrismaClient();

type JsonRecord = Record<string, unknown>;

interface RecipeCandidate {
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
  /** Dishes per meal ("Số món mỗi bữa"); without it, one dish per meal (older behaviour). */
  mealCounts?: MealCounts;
  /** Recipes the user removed in the last 7 days: not picked (unless nothing else fits a meal). */
  excludeRecipeIds?: string[];
  /** Already loaded recipes / Kho (several days generated in one request load them once). */
  preloaded?: { recipes: RecipeCandidate[]; khoItems: KhoItem[] };
}

interface AutoRefreshInput {
  inventoryItems: unknown[];
  recipes?: unknown[];
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
    }];
  });
}

const RECIPES_UNAVAILABLE = "Không tải được danh sách món ăn (recipe-service không phản hồi). Hãy thử lại sau.";
const NO_RECIPES = "Chưa có món ăn nào để gợi ý. Hãy thêm công thức trong recipe-service.";

/** Active recipes from recipe-service (or the supplied list). Unreachable or empty → 503 with a clear message. */
async function getRecipes(suppliedRecipes?: unknown[]): Promise<RecipeCandidate[]> {
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
function itemDate(menuStart: Date, dayOfWeek: number): Date {
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
        ...(owner.familyId ? { familyId: owner.familyId } : { userId: owner.userId }),
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
        ...(owner.familyId ? { familyId: owner.familyId } : { userId: owner.userId }),
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

const toSuggestRecipe = (recipe: RecipeCandidate): SuggestRecipe => ({
  id: recipe.id,
  name: recipe.name,
  imageUrl: recipe.imageUrl,
  calories: recipe.calories ?? null,
  mealTypes: recipe.mealTypes,
  tags: recipe.tags,
  ingredients: recipe.details,
  role: recipe.role,
});

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

export async function generateMenu(input: GenerateMenuInput, client: PrismaClient = prisma) {
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
  const pool = recipes.filter((recipe) => {
    const avoid = readStringList(constraints.avoidIngredients);
    const required = readStringList(constraints.requiredIngredients);
    const diets = readStringList(constraints.dietaryTags);
    return !matchesAny(recipe.ingredients, avoid)
      && required.every((ingredient) => recipe.ingredients.includes(ingredient))
      && diets.every((diet) => recipe.dietaryTags.includes(diet));
  }).map(toSuggestRecipe);
  if (pool.length === 0) throw new MenuServiceError("Không có món nào phù hợp với yêu cầu.", 422);

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
    const excludeIds = new Set(input.excludeRecipeIds ?? []);
    const picks: Array<{ meal: string; role: string | null; suggestion: DishSuggestion | null }> = input.mealCounts
      ? mealTypes.flatMap((meal) => {
        const count = meal in input.mealCounts! ? input.mealCounts![meal as keyof MealCounts] : 1;
        const options = { today, day: dayKey(date), recentRecipeIds, usedIds: chosenToday, history: variety };
        // Recently removed dishes are skipped, unless that leaves the meal without enough dishes.
        let mealPicks = pickMealDishes(pool, kho, meal, count, { ...options, excludeIds });
        if (mealPicks.length < count && excludeIds.size > 0) {
          mealPicks = [...mealPicks, ...pickMealDishes(pool, kho, meal, count - mealPicks.length, options)];
        }
        return mealPicks.map((pick) => ({ meal, role: pick.role, suggestion: pick.suggestion }));
      })
      : pickDishes(pool, kho, mealTypes, { today, day: dayKey(date), recentRecipeIds }).map((pick) => ({ ...pick, role: pick.suggestion?.recipe.role ?? null }));
    for (const { meal, role, suggestion } of picks) {
      if (!suggestion) continue;
      chosenToday.add(suggestion.recipe.id);
      addToHistory(variety, dayKey(date), meal, suggestion.recipe.id);
      items.push({
        recipeId: suggestion.recipe.id,
        dishName: suggestion.recipe.name,
        mealType: meal as MealType,
        dayOfWeek,
        calories: suggestion.recipe.calories,
        details: {
          imageUrl: suggestion.recipe.imageUrl,
          availableIngredients: suggestion.availableIngredients,
          missingIngredients: suggestion.missingIngredients,
          availableCount: suggestion.availableCount,
          totalCount: suggestion.totalCount,
          reason: suggestion.reason,
          role: role ?? suggestion.recipe.role ?? null,
        },
      });
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
    khoHash,
    title,
    periodType: input.periodType,
    startDate,
    endDate,
  };
  try {
    // "Làm mới theo kho": the new suggestion replaces this user's menu for the same period and dates.
    return await client.$transaction(async (tx) => {
      await tx.menu.deleteMany({ where: { userId: input.userId, periodType: input.periodType, startDate, endDate } });
      return tx.menu.create({ data: { ...data, items: { create: items } }, include: { items: true } });
    });
  } catch (error) {
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

export function createManualMenu(userId: string, input: ManualMenuInput, client: PrismaClient = prisma) {
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  if (endDate < startDate) {
    throw new MenuServiceError("endDate must be on or after startDate", 400);
  }
  return client.menu.create({
    data: {
      userId,
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

/** The user's menus; with `from`/`to` (YYYY-MM-DD) only those overlapping that range (one request per week/month view). */
export function listMenus(userId: string, client: PrismaClient = prisma, range?: { from: Date; to: Date }) {
  return client.menu.findMany({
    where: range ? { userId, startDate: { lte: range.to }, endDate: { gte: range.from } } : { userId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export function findMenu(userId: string, id: string, client: PrismaClient = prisma) {
  return client.menu.findFirst({ where: { id, userId }, include: { items: true } });
}

export async function deleteMenu(userId: string, id: string, client: PrismaClient = prisma): Promise<boolean> {
  const result = await client.menu.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function autoRefreshMenu(userId: string, input: AutoRefreshInput, client: PrismaClient = prisma) {
  const recipes = await getRecipes(input.recipes);
  const available = inventoryNames(input.inventoryItems);
  if (available.length === 0) {
    throw new MenuServiceError("inventoryItems must contain ingredient names", 400);
  }

  const activeMenus = await client.menu.findMany({
    where: { userId },
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

/** "Số món mỗi bữa" of a user (defaults 3 / 5 / 5). */
export async function getMenuSettings(userId: string, client: PrismaClient = prisma): Promise<MealCounts> {
  const row = await client.menuSettings.findUnique({ where: { userId } });
  return row ? { BREAKFAST: row.breakfast, LUNCH: row.lunch, DINNER: row.dinner } : { ...DEFAULT_MEAL_COUNTS };
}

export async function updateMenuSettings(userId: string, counts: { breakfast: number; lunch: number; dinner: number }, client: PrismaClient = prisma): Promise<MealCounts> {
  const row = await client.menuSettings.upsert({ where: { userId }, create: { userId, ...counts }, update: counts });
  return { BREAKFAST: row.breakfast, LUNCH: row.lunch, DINNER: row.dinner };
}

/** Recipes and dish names the user removed in the last 7 days (dislike history). */
export async function recentlyRemoved(userId: string, client: PrismaClient = prisma, now: Date = new Date()): Promise<{ recipeIds: Set<string>; names: Set<string> }> {
  const rows = await client.removedDish.findMany({ where: { userId, removedAt: { gte: addDays(now, -DISLIKE_DAYS) } } });
  return {
    recipeIds: new Set(rows.flatMap((row) => (row.recipeId ? [row.recipeId] : []))),
    names: new Set(rows.map((row) => normalizeText(row.dishName))),
  };
}

type RemoveInput = {
  userId: string;
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
};

/**
 * Removes one dish from a (today or future) day menu and puts ONE replacement in the same meal and role: the best
 * Kho-scored catalog dish not already in the day, not removed by the user in the last 7 days and not hidden.
 * If no catalog dish fits, an AI suggestion for that meal fills the slot; otherwise the slot stays empty.
 * The removed dish is stored in the user's dislike history. Past days cannot be edited.
 */
export async function removeMenuItem(input: RemoveInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const menu = await client.menu.findFirst({ where: { id: input.menuId, userId: input.userId }, include: { items: true } });
  if (!menu) throw new MenuServiceError("Menu not found", 404);
  if (isPastDay(menu.endDate, now)) throw new MenuServiceError("Không thể sửa thực đơn của ngày đã qua.", 422);
  const item = menu.items.find((entry) => entry.id === input.itemId);
  if (!item) throw new MenuServiceError("Món này không còn trong thực đơn.", 404);

  await client.removedDish.create({ data: { userId: input.userId, recipeId: item.recipeId, dishName: item.dishName } });
  const removed = await recentlyRemoved(input.userId, client, now);

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
  const pick = pickReplacement(recipes.map(toSuggestRecipe), kho, item.mealType, role, { today, day, excludeIds, history });

  let replacement: Prisma.MenuItemUncheckedCreateInput | null = null;
  if (pick) {
    replacement = {
      menuId: menu.id,
      recipeId: pick.recipe.id,
      dishName: pick.recipe.name,
      mealType: item.mealType,
      dayOfWeek: item.dayOfWeek,
      calories: pick.recipe.calories,
      details: {
        imageUrl: pick.recipe.imageUrl,
        availableIngredients: pick.availableIngredients,
        missingIngredients: pick.missingIngredients,
        availableCount: pick.availableCount,
        totalCount: pick.totalCount,
        reason: pick.reason,
        role,
      } as Prisma.InputJsonValue,
    };
  } else if (input.aiDishes && menu.familyId) {
    const dayNames = new Set(others.map((entry) => normalizeText(entry.dishName)));
    const aiDishes = await input.aiDishes(menu.familyId, khoItems).catch(() => [] as AiDish[]);
    const aiPick = aiDishes.find((dish) => dish.mealType === AI_MEAL[item.mealType]
      && !dayNames.has(normalizeText(dish.name)) && !removed.names.has(normalizeText(dish.name)) && normalizeText(dish.name) !== normalizeText(item.dishName));
    if (aiPick) {
      replacement = {
        menuId: menu.id,
        recipeId: null,
        dishName: aiPick.name,
        mealType: item.mealType,
        dayOfWeek: item.dayOfWeek,
        calories: null,
        details: { ai: true, aiDish: aiPick, role } as unknown as Prisma.InputJsonValue,
      };
    }
  }

  await client.$transaction([
    client.menuItem.delete({ where: { id: item.id } }),
    ...(replacement ? [client.menuItem.create({ data: replacement })] : []),
  ]);
  return client.menu.findFirst({ where: { id: menu.id }, include: { items: true } });
}


const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MEALS = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER] as const;

type DaysInput = Omit<GenerateMenuInput, "periodType" | "startDate" | "endDate" | "preloaded"> & { days: string[]; now?: Date };

/**
 * Theo tuần: generates a DAY menu for each given day that is today or later and has no menu yet (one request,
 * same rules as a single day; Kho and recipes loaded once). Existing menus and past days are left as they are.
 */
export async function generateDays(input: DaysInput, client: PrismaClient = prisma) {
  const today = vnDay(input.now ?? new Date());
  const days = [...new Set(input.days)].filter((day) => DAY_PATTERN.test(day) && day >= today).sort();
  if (days.length === 0) return [];
  const existing = await client.menu.findMany({
    where: { userId: input.userId, periodType: PeriodType.DAY, startDate: { in: days.map((day) => new Date(`${day}T00:00:00.000Z`)) } },
    select: { startDate: true },
  });
  const taken = new Set(existing.map((menu) => dayKey(menu.startDate)));
  const missing = days.filter((day) => !taken.has(day));
  if (missing.length === 0) return [];
  const [recipes, khoItems] = await Promise.all([
    getRecipes(input.recipes),
    input.inventoryItems !== undefined ? Promise.resolve(readKhoItems(input.inventoryItems))
      : input.familyId ? getKhoItems(input.familyId, input.authorization) : Promise.resolve([] as KhoItem[]),
  ]);
  const created = [];
  // One day after another, so each day sees the previous days and avoids repeating their dishes.
  for (const day of missing) {
    const date = new Date(`${day}T00:00:00.000Z`);
    created.push(await generateMenu({ ...input, periodType: PeriodType.DAY, startDate: date, endDate: date, preloaded: { recipes, khoItems } }, client));
  }
  return created;
}

type TopUpInput = { userId: string; menuId: string; authorization?: string; now?: Date; mealCounts: MealCounts; recipes?: unknown[]; inventoryItems?: unknown[] };

/**
 * Upgrades a day menu made before multi-dish menus (its dishes carry no role): adds only the missing dishes of each
 * meal up to "Số món mỗi bữa", keeping the existing ones. Runs once (the new dishes carry roles); newer menus,
 * full meals and past days are left unchanged.
 */
export async function topUpMenu(input: TopUpInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const menu = await client.menu.findFirst({ where: { id: input.menuId, userId: input.userId }, include: { items: true } });
  if (!menu) throw new MenuServiceError("Menu not found", 404);
  if (isPastDay(menu.endDate, now)) throw new MenuServiceError("Không thể sửa thực đơn của ngày đã qua.", 422);
  const legacy = menu.periodType === PeriodType.DAY && !menu.items.some((item) => typeof asRecord(item.details).role === "string");
  if (!legacy) return menu;
  const short = DAY_MEALS.filter((meal) => menu.items.filter((item) => item.mealType === meal).length < input.mealCounts[meal]);
  if (short.length === 0) return menu;

  const [recipes, khoItems, removed] = await Promise.all([
    getRecipes(input.recipes).catch(() => [] as RecipeCandidate[]),
    input.inventoryItems !== undefined ? Promise.resolve(readKhoItems(input.inventoryItems))
      : menu.familyId ? getKhoItems(menu.familyId, input.authorization).catch(() => [] as KhoItem[]) : Promise.resolve([] as KhoItem[]),
    recentlyRemoved(input.userId, client, now),
  ]);
  const today = vnDay(now);
  const kho = usableKho(khoItems, today);
  const pool = recipes.map(toSuggestRecipe);
  const usedIds = new Set(menu.items.flatMap((item) => (item.recipeId ? [item.recipeId] : [])));
  const day = dayKey(normalizeDate(menu.startDate));
  const history = await mealHistory(client, { userId: input.userId, familyId: menu.familyId }, normalizeDate(menu.startDate), normalizeDate(menu.startDate));
  const creates: Prisma.MenuItemUncheckedCreateInput[] = [];
  for (const meal of short) {
    const have = menu.items.filter((item) => item.mealType === meal).length;
    // The existing (older) dishes are taken as the first slots; only the remaining slots are filled.
    const roles = roleSlots(meal, input.mealCounts[meal]).slice(have);
    const picks = pickRoleDishes(pool, kho, meal, roles, { today, day, recentRecipeIds: new Set(), usedIds, excludeIds: removed.recipeIds, history });
    const dayOfWeek = ((normalizeDate(menu.startDate).getUTCDay() + 6) % 7) + 1;
    for (const { role, suggestion } of picks) {
      creates.push({
        menuId: menu.id,
        recipeId: suggestion.recipe.id,
        dishName: suggestion.recipe.name,
        mealType: meal,
        dayOfWeek,
        calories: suggestion.recipe.calories,
        details: {
          imageUrl: suggestion.recipe.imageUrl,
          availableIngredients: suggestion.availableIngredients,
          missingIngredients: suggestion.missingIngredients,
          availableCount: suggestion.availableCount,
          totalCount: suggestion.totalCount,
          reason: suggestion.reason,
          role,
        } as Prisma.InputJsonValue,
      });
    }
  }
  if (creates.length > 0) await client.$transaction(creates.map((data) => client.menuItem.create({ data })));
  return client.menu.findFirst({ where: { id: menu.id }, include: { items: true } });
}
