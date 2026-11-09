import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, PrismaClient } from "@prisma/client";
import {
  autoRefreshMenu,
  createManualMenu,
  deleteMenu,
  findMenu,
  generateMenu,
  listMenus,
} from "../services/menu.service";
import { checkoutSchema, createMenuSchema } from "../controllers/menu.controller";

test("menu request schemas reject malformed dates, empty titles and invalid checkout amounts", () => {
  const validMenu = {
    title: "Lunch",
    periodType: PeriodType.DAY,
    startDate: "2026-11-02",
    endDate: "2026-11-02",
    items: [],
  };
  assert.equal(createMenuSchema.safeParse(validMenu).success, true);
  assert.equal(createMenuSchema.safeParse({ ...validMenu, title: " " }).success, false);
  assert.equal(createMenuSchema.safeParse({ ...validMenu, items: [{ dishName: "", dayOfWeek: 8 }] }).success, false);
  assert.equal(checkoutSchema.safeParse({ orderId: "order-1", amount: 10, provider: "VNPAY" }).success, true);
  assert.equal(checkoutSchema.safeParse({ orderId: "order-1", amount: -1, provider: "MOMO" }).success, false);
});

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

test("menu create, list, find and delete use Prisma with user-scoped CRUD filters", async () => {
  const calls: Array<{ operation: string; args: unknown }> = [];
  const client = {
    menu: {
      create: async (args: unknown) => { calls.push({ operation: "create", args }); return { id: "menu-1" }; },
      findMany: async (args: unknown) => { calls.push({ operation: "findMany", args }); return [{ id: "menu-1" }]; },
      findFirst: async (args: unknown) => { calls.push({ operation: "findFirst", args }); return { id: "menu-1" }; },
      deleteMany: async (args: unknown) => { calls.push({ operation: "deleteMany", args }); return { count: 1 }; },
    },
  } as unknown as PrismaClient;
  const dates = {
    startDate: new Date("2026-11-02T10:00:00.000Z"),
    endDate: new Date("2026-11-03T10:00:00.000Z"),
  };

  const created = await createManualMenu("user-1", {
    title: "  Meal plan ",
    periodType: PeriodType.WEEK,
    ...dates,
    items: [{
      dishName: "Rice bowl",
      mealType: MealType.LUNCH,
      dayOfWeek: 1,
    }],
  }, client);
  assert.deepEqual(created, { id: "menu-1" });
  assert.equal((await listMenus("user-1", client)).length, 1);
  assert.deepEqual(await findMenu("user-1", "menu-1", client), { id: "menu-1" });
  assert.equal(await deleteMenu("user-1", "menu-1", client), true);
  assert.equal(calls[0].operation, "create");
  assert.deepEqual(calls[0].args, {
    data: {
      userId: "user-1",
      title: "Meal plan",
      periodType: PeriodType.WEEK,
      startDate: new Date("2026-11-02T00:00:00.000Z"),
      endDate: new Date("2026-11-03T00:00:00.000Z"),
      items: {
        create: [{
          dishName: "Rice bowl",
          mealType: MealType.LUNCH,
          dayOfWeek: 1,
          recipeId: null,
          calories: null,
        }],
      },
    },
    include: { items: true },
  });
  assert.deepEqual(calls.slice(1).map(({ args }) => args), [
    { where: { userId: "user-1" }, include: { items: true }, orderBy: { createdAt: "desc" } },
    { where: { id: "menu-1", userId: "user-1" }, include: { items: true } },
    { where: { id: "menu-1", userId: "user-1" } },
  ]);
});