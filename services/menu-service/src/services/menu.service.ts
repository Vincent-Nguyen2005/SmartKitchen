import { MealType, PeriodType, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

type JsonRecord = Record<string, unknown>;

interface RecipeCandidate {
  id: string;
  name: string;
  ingredients: string[];
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

const defaultRecipes: RecipeCandidate[] = [
  { id: "sample-oatmeal", name: "Cháo yến mạch trái cây", ingredients: ["yến mạch", "sữa", "chuối"], mealTypes: ["breakfast"], dietaryTags: [], tags: [], calories: 320 },
  { id: "sample-egg-toast", name: "Bánh mì trứng rau xanh", ingredients: ["trứng", "bánh mì", "rau xanh"], mealTypes: ["breakfast"], dietaryTags: [], tags: [], calories: 380 },
  { id: "sample-chicken-rice", name: "Cơm gà rau củ", ingredients: ["gà", "gạo", "cà rốt", "bông cải"], mealTypes: ["lunch", "dinner"], dietaryTags: [], tags: [], calories: 560 },
  { id: "sample-tofu-bowl", name: "Đậu phụ sốt cà chua", ingredients: ["đậu phụ", "cà chua", "gạo"], mealTypes: ["lunch", "dinner"], dietaryTags: ["vegetarian"], tags: [], calories: 430 },
  { id: "sample-fish", name: "Cá hấp gừng và rau", ingredients: ["cá", "gừng", "rau xanh"], mealTypes: ["lunch", "dinner"], dietaryTags: [], tags: [], calories: 470 },
  { id: "sample-yogurt", name: "Sữa chua trái cây", ingredients: ["sữa chua", "chuối"], mealTypes: ["snack"], dietaryTags: [], tags: [], calories: 180 },
];

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
      mealTypes: readStringList(record.mealTypes ?? record.suitableMealTypes),
      dietaryTags: readStringList(record.dietaryTags ?? record.diets),
      tags: readStringList(record.tags),
      calories: typeof record.calories === "number" && Number.isFinite(record.calories) ? record.calories : undefined,
    }];
  });
}

async function getRecipes(suppliedRecipes?: unknown[]): Promise<RecipeCandidate[]> {
  let values = suppliedRecipes;
  if (values === undefined) {
    const baseUrl = process.env.RECIPE_SERVICE_URL ?? "http://localhost:4006";
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/recipes`);
      if (response.ok) values = recipeListFromResponse(await response.json());
    } catch {
      values = undefined;
    }
    if (values === undefined || values.length === 0) return defaultRecipes;
  }

  const recipes = normalizeRecipes(values);
  if (recipes.length === 0) {
    return defaultRecipes;
  }
  return recipes;
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

export async function generateMenu(input: GenerateMenuInput, client: PrismaClient = prisma) {
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  if (endDate < startDate) {
    throw new MenuServiceError("endDate must be on or after startDate", 400);
  }

  const recipes = await getRecipes(input.recipes);
  const preferences = input.preferences ?? {};
  const constraints = input.constraints ?? {};
  const dates = datesInRange(startDate, endDate);
  const mealTypes = selectedMealTypes(preferences);
  const scheduledWeekdays = new Set<number>();
  const items: Array<{
    recipeId: string | null;
    dishName: string;
    mealType: MealType;
    dayOfWeek: number;
    calories: number | null;
  }> = [];

  for (const [dayIndex, date] of dates.entries()) {
    const dayOfWeek = ((date.getUTCDay() + 6) % 7) + 1;
    if (scheduledWeekdays.has(dayOfWeek)) continue;
    scheduledWeekdays.add(dayOfWeek);
    const usedIds = new Set<string>();
    for (const [mealIndex, mealType] of mealTypes.entries()) {
      const offset = (dayIndex * mealTypes.length + mealIndex) % recipes.length;
      const rotatedRecipes = [...recipes.slice(offset), ...recipes.slice(0, offset)];
      const recipe = chooseRecipe(rotatedRecipes, mealType, preferences, constraints, [], usedIds);
      usedIds.add(recipe.id);
      items.push({
        recipeId: recipe.id,
        dishName: recipe.name,
        mealType,
        dayOfWeek,
        calories: recipe.calories ?? null,
      });
    }
  }

  const defaultTitle = `${input.periodType.toLocaleLowerCase()} menu starting ${startDate.toISOString().slice(0, 10)}`;
  const title = input.title?.trim() || defaultTitle;
  try {
    return await client.menu.create({
      data: {
        userId: input.userId,
        title,
        periodType: input.periodType,
        startDate,
        endDate,
        items: { create: items },
      },
      include: { items: true },
    });
  } catch (error) {
    console.error("Generate Menu Error:", error);
    const id = randomUUID();
    const now = new Date();
    return {
      id,
      userId: input.userId,
      title,
      periodType: input.periodType,
      startDate,
      endDate,
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

export function listMenus(userId: string, client: PrismaClient = prisma) {
  return client.menu.findMany({
    where: { userId },
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