import { MealType, PeriodType, Prisma, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { randomUUID } from "node:crypto";
import {
  type DishIngredient,
  type KhoItem,
  pickDishes,
  REPEAT_WINDOW_DAYS,
  type SuggestRecipe,
  usableKho,
  vnDay,
} from "./kho-suggest";

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

const toSuggestRecipe = (recipe: RecipeCandidate): SuggestRecipe => ({
  id: recipe.id,
  name: recipe.name,
  imageUrl: recipe.imageUrl,
  calories: recipe.calories ?? null,
  mealTypes: recipe.mealTypes,
  tags: recipe.tags,
  ingredients: recipe.details,
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
  const [recipes, khoItems] = await Promise.all([
    getRecipes(input.recipes),
    input.inventoryItems !== undefined
      ? Promise.resolve(readKhoItems(input.inventoryItems))
      : input.familyId ? getKhoItems(input.familyId, input.authorization) : Promise.resolve([]),
  ]);
  const kho = usableKho(khoItems, today);
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
    const picks = pickDishes(pool, kho, mealTypes, { today, day: dayKey(date), recentRecipeIds });
    const chosenToday = new Set<string>();
    for (const { meal, suggestion } of picks) {
      if (!suggestion) continue;
      chosenToday.add(suggestion.recipe.id);
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