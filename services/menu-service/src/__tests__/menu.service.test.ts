import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, PrismaClient } from "@prisma/client";
import { autoRefreshMenu, generateMenu } from "../services/menu.service";

test("generateMenu selects one suitable recipe per meal and persists weekdays", async () => {
  let createArgs: unknown;
  const client = {
    menu: {
      create: async (args: unknown) => {
        createArgs = args;
        return args;
      },
    },
  } as unknown as PrismaClient;

  await generateMenu({
    userId: "user-1",
    periodType: PeriodType.WEEK,
    startDate: new Date("2026-11-02T00:00:00.000Z"),
    endDate: new Date("2026-11-03T00:00:00.000Z"),
    recipes: [
      { id: "breakfast", name: "Oatmeal", ingredients: ["oats"], mealTypes: ["breakfast"], calories: 300 },
      { id: "high-calorie-breakfast", name: "Large breakfast", ingredients: [], mealTypes: ["breakfast"], calories: 1200 },
      { id: "lunch", name: "Rice bowl", ingredients: ["rice"], mealTypes: ["lunch"], calories: 520 },
      { id: "dinner", name: "Fish and greens", ingredients: ["fish"], mealTypes: ["dinner"], calories: 460 },
    ],
  }, client);

  const data = (createArgs as { data: { userId: string; items: { create: Array<{ recipeId: string; mealType: MealType; dayOfWeek: number; calories: number }> } } }).data;
  assert.equal(data.userId, "user-1");
  assert.equal(data.items.create.length, 6);
  assert.deepEqual(data.items.create.slice(0, 3).map((item) => item.mealType), [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]);
  assert.deepEqual([...new Set(data.items.create.map((item) => item.dayOfWeek))], [1, 2]);
  assert.ok(data.items.create.every((item) => item.calories > 0));
  assert.equal(data.items.create[0].recipeId, "breakfast");
});

test("generateMenu returns a marked mock menu when the catalog and database are unavailable", async () => {
  const client = {
    menu: {
      create: async () => { throw new Error("database unavailable"); },
    },
  } as unknown as PrismaClient;
  const loggedErrors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => loggedErrors.push(args);

  let result: Awaited<ReturnType<typeof generateMenu>>;
  try {
    result = await generateMenu({
      userId: "user-2",
      periodType: PeriodType.DAY,
      startDate: new Date("2026-11-06T00:00:00.000Z"),
      endDate: new Date("2026-11-06T00:00:00.000Z"),
      recipes: [],
    }, client);
  } finally {
    console.error = originalError;
  }

  const fallback = result as typeof result & { persisted?: boolean };
  assert.equal(fallback.persisted, false);
  assert.equal(fallback.userId, "user-2");
  assert.ok(fallback.items.length > 0);
  assert.ok(loggedErrors.some(([message]) => message === "Generate Menu Error:"));
});

test("autoRefreshMenu replaces a dish with one that matches new inventory", async () => {
  const updates: Array<{ where: { id: string }; data: { recipeId: string; dishName: string; calories: number | null } }> = [];
  const client = {
    menu: {
      findMany: async () => [{
        id: "menu-1",
        items: [{ id: "item-1", recipeId: "old-recipe", mealType: MealType.LUNCH }],
      }],
    },
    menuItem: {
      update: async (args: (typeof updates)[number]) => {
        updates.push(args);
        return args;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;

  const result = await autoRefreshMenu("user-1", {
    inventoryItems: ["spinach"],
    recipes: [{
      id: "new-recipe",
      name: "Spinach rice bowl",
      ingredients: ["spinach", "rice"],
      mealTypes: ["lunch"],
      calories: 410,
    }],
  }, client);

  assert.equal(result.scannedMenus, 1);
  assert.equal(result.replacements.length, 1);
  assert.deepEqual(updates[0], {
    where: { id: "item-1" },
    data: { recipeId: "new-recipe", dishName: "Spinach rice bowl", calories: 410 },
  });
});