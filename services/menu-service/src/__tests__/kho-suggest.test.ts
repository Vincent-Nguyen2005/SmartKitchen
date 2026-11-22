import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { PeriodType, type PrismaClient } from "../../node_modules/.prisma/client-menu";
import { evaluateRecipe, pickDishes, sameIngredient, type KhoItem, type SuggestRecipe, usableKho } from "../services/kho-suggest";
import { generateMenu, MenuServiceError } from "../services/menu.service";

const today = "2026-11-21";
const recipe = (id: string, ingredients: Array<[string, number | null, string | null]>, mealTypes = ["lunch"], tags: string[] = []): SuggestRecipe => ({
  id, name: id, imageUrl: null, calories: 300, mealTypes, tags,
  ingredients: ingredients.map(([name, quantity, unit]) => ({ name, quantity, unit })),
});
const kho = (name: string, quantity: number | null = null, unit: string | null = null, expiryDate: string | null = null): KhoItem => ({ name, quantity, unit, expiryDate });

test("ingredient names match without accents, but one-word names keep their accents", () => {
  assert.ok(sameIngredient("trung ga", "Trứng gà"));
  assert.ok(sameIngredient("Trứng", "Trứng gà"));
  assert.ok(sameIngredient("Thit ba chi", "Thịt ba chỉ heo"));
  assert.ok(!sameIngredient("Cá", "Cà chua"));
  assert.ok(!sameIngredient("Gà", "Gạo"));
});

test("scoring order: the dish with the larger share of ingredients in Kho comes first", () => {
  const recipes = [
    recipe("Canh chua cá", [["Cá basa", 400, "GRAM"], ["Cà chua", 2, "PIECE"], ["Dứa", 200, "GRAM"], ["Giá đỗ", 100, "GRAM"]]),
    recipe("Trứng xào cà chua", [["Trứng gà", 4, "PIECE"], ["Cà chua", 3, "PIECE"], ["Hành lá", 20, "GRAM"]]),
  ];
  const items = [kho("Trứng", 10, "PIECE"), kho("Cà chua", 5, "PIECE")];
  const [{ suggestion }] = pickDishes(recipes, items, ["LUNCH"], { today, day: today, recentRecipeIds: new Set() });
  assert.equal(suggestion?.recipe.id, "Trứng xào cà chua");
  assert.equal(suggestion?.reason, "Có sẵn 2/3 nguyên liệu");
  assert.deepEqual(suggestion?.availableIngredients, ["Trứng gà", "Cà chua"]);
  assert.deepEqual(suggestion?.missingIngredients, [{ name: "Hành lá", quantity: 20, unit: "GRAM" }]);
});

test("quantities count when units compare: too little in Kho becomes a missing shortfall", () => {
  const result = evaluateRecipe(recipe("Bò xào", [["Thịt bò", 300, "GRAM"], ["Tỏi", 20, "GRAM"]]), [kho("Thịt bò", 0.1, "KILOGRAM"), kho("Tỏi", 1, "PACK")], today, new Set(), today);
  assert.deepEqual(result.missingIngredients, [{ name: "Thịt bò", quantity: 200, unit: "GRAM" }]);
  // Units that cannot be compared (PACK vs GRAM): present is enough.
  assert.deepEqual(result.availableIngredients, ["Tỏi"]);
});

test("expiring bonus: a dish using an item that expires within 3 days beats an equal one, with the reason", () => {
  const recipes = [
    recipe("Gà kho gừng", [["Thịt gà", 600, "GRAM"], ["Gừng", 50, "GRAM"]]),
    recipe("Trứng xào hành", [["Trứng gà", 4, "PIECE"], ["Hành lá", 20, "GRAM"]]),
  ];
  const items = [
    kho("Thịt gà", 1, "KILOGRAM", "2026-12-20T00:00:00.000Z"),
    kho("Gừng", 100, "GRAM"),
    kho("Trứng gà", 10, "PIECE", "2026-11-22T17:00:00.000Z"),
    kho("Hành lá", 50, "GRAM"),
  ];
  const [{ suggestion }] = pickDishes(recipes, items, ["LUNCH"], { today, day: today, recentRecipeIds: new Set() });
  assert.equal(suggestion?.recipe.id, "Trứng xào hành");
  assert.equal(suggestion?.reason, "Dùng trứng gà sắp hết hạn · Có sẵn 2/2 nguyên liệu");
});

test("expired Kho items are not used, and a dish from the last 3 days gets a small penalty", () => {
  assert.deepEqual(usableKho([kho("Sữa", 1, "BOX", "2026-11-19T00:00:00.000Z"), kho("Gạo")], today).map((item) => item.name), ["Gạo"]);
  const recipes = [recipe("A", [["Gạo", null, null]]), recipe("B", [["Gạo", null, null]])];
  const [{ suggestion }] = pickDishes(recipes, [kho("Gạo")], ["LUNCH"], { today, day: today, recentRecipeIds: new Set(["A"]) });
  assert.equal(suggestion?.recipe.id, "B");
});

test("empty Kho: popular dishes, varied by day, never the same dish twice in one day", () => {
  const recipes = Array.from({ length: 8 }, (_, index) => recipe(`dish-${index}`, [["X", null, null]], ["breakfast", "lunch", "dinner"], index < 4 ? ["phổ biến"] : []));
  const picksFor = (day: string) => pickDishes(recipes, [], ["BREAKFAST", "LUNCH", "DINNER"], { today, day, recentRecipeIds: new Set() });
  const first = picksFor("2026-11-21");
  assert.equal(new Set(first.map(({ suggestion }) => suggestion?.recipe.id)).size, 3);
  assert.ok(first.every(({ suggestion }) => suggestion?.reason === "Kho đang trống, gợi ý món phổ biến"));
  const days = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"].map((day) => picksFor(day).map(({ suggestion }) => suggestion?.recipe.id).join());
  assert.ok(new Set(days).size > 1, "the fallback menu changes between days");
});

async function withUpstream(handler: (path: string) => { status: number; body?: unknown } | "close", run: (url: string) => Promise<void>): Promise<void> {
  const server: Server = createServer((request, response) => {
    const result = handler(request.url ?? "");
    if (result === "close") { request.socket.destroy(); return; }
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const unusedClient = {} as PrismaClient;
const dayInput = { userId: "user-1", periodType: PeriodType.DAY, startDate: new Date("2026-11-21T00:00:00.000Z"), endDate: new Date("2026-11-21T00:00:00.000Z") };

test("upstream down: recipe-service or inventory-service unavailable gives a clear 503, no crash", async () => {
  const saved = { recipe: process.env.RECIPE_SERVICE_URL, inventory: process.env.INVENTORY_API_URL };
  try {
    process.env.RECIPE_SERVICE_URL = "http://127.0.0.1:1";
    await assert.rejects(generateMenu(dayInput, unusedClient), (error: unknown) =>
      error instanceof MenuServiceError && error.statusCode === 503 && error.message.includes("recipe-service"));

    await withUpstream(() => ({ status: 200, body: [{ id: "r1", name: "Phở bò", ingredients: ["Bánh phở"] }] }), async (recipeUrl) => {
      process.env.RECIPE_SERVICE_URL = recipeUrl;
      await withUpstream(() => ({ status: 502 }), async (inventoryUrl) => {
        process.env.INVENTORY_API_URL = inventoryUrl;
        await assert.rejects(generateMenu({ ...dayInput, familyId: "11111111-1111-4111-8111-111111111111", authorization: "Bearer t" }, unusedClient), (error: unknown) =>
          error instanceof MenuServiceError && error.statusCode === 503 && error.message.includes("Kho"));
      });
      await withUpstream(() => ({ status: 403 }), async (inventoryUrl) => {
        process.env.INVENTORY_API_URL = inventoryUrl;
        await assert.rejects(generateMenu({ ...dayInput, familyId: "11111111-1111-4111-8111-111111111111" }, unusedClient), (error: unknown) =>
          error instanceof MenuServiceError && error.statusCode === 403);
      });
    });

    await withUpstream(() => ({ status: 200, body: [] }), async (recipeUrl) => {
      process.env.RECIPE_SERVICE_URL = recipeUrl;
      await assert.rejects(generateMenu(dayInput, unusedClient), (error: unknown) => error instanceof MenuServiceError && error.statusCode === 503);
    });
  } finally {
    process.env.RECIPE_SERVICE_URL = saved.recipe;
    process.env.INVENTORY_API_URL = saved.inventory;
    if (saved.recipe === undefined) delete process.env.RECIPE_SERVICE_URL;
    if (saved.inventory === undefined) delete process.env.INVENTORY_API_URL;
  }
});

test("generateMenu reads Kho from inventory-service with the caller's token and uses it", async () => {
  const saved = { recipe: process.env.RECIPE_SERVICE_URL, inventory: process.env.INVENTORY_API_URL };
  let inventoryPath = "";
  try {
    await withUpstream(() => ({ status: 200, body: [
      { id: "r1", name: "Trứng xào cà chua", mealTypes: [], ingredientDetails: [{ name: "Trứng gà", quantity: 4, unit: "PIECE" }, { name: "Cà chua", quantity: 2, unit: "PIECE" }] },
      { id: "r2", name: "Canh chua cá", mealTypes: [], ingredients: ["Cá basa", "Dứa"] },
    ] }), async (recipeUrl) => {
      process.env.RECIPE_SERVICE_URL = recipeUrl;
      await withUpstream((path) => {
        inventoryPath = path;
        return { status: 200, body: { success: true, items: [
          { name: "Trứng", quantity: 6, unit: "PIECE", status: "FRESH", expiryDate: null },
          { name: "Cá basa", quantity: 1, unit: "KILOGRAM", status: "CONSUMED", expiryDate: null },
        ], pagination: { totalPages: 1 } } };
      }, async (inventoryUrl) => {
        process.env.INVENTORY_API_URL = inventoryUrl;
        const created: Array<{ data: { familyId: string | null; items: { create: Array<{ recipeId: string; mealType: string; details: { reason: string } }> } } }> = [];
        const menu = {
          findMany: async () => [],
          deleteMany: async () => ({ count: 0 }),
          create: async (args: (typeof created)[number]) => { created.push(args); return args; },
        };
        const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
        await generateMenu({ ...dayInput, familyId: "11111111-1111-4111-8111-111111111111", authorization: "Bearer t", preferences: { mealTypes: ["lunch"] } }, client);
        assert.match(inventoryPath, /^\/api\/inventory\/items\?familyId=11111111-1111-4111-8111-111111111111&page=1&limit=100$/);
        const [item] = created[0].data.items.create;
        assert.equal(created[0].data.familyId, "11111111-1111-4111-8111-111111111111");
        // The consumed fish does not count; eggs are in Kho, so the egg dish wins.
        assert.equal(item.recipeId, "r1");
        assert.equal(item.details.reason, "Có sẵn 1/2 nguyên liệu");
      });
    });
  } finally {
    process.env.RECIPE_SERVICE_URL = saved.recipe;
    process.env.INVENTORY_API_URL = saved.inventory;
    if (saved.recipe === undefined) delete process.env.RECIPE_SERVICE_URL;
    if (saved.inventory === undefined) delete process.env.INVENTORY_API_URL;
  }
});

test("stale menu detection: generateMenu stores the Kho snapshot hash; same Kho same hash, a Kho change gives a new one", async () => {
  const { snapshotHash, khoSnapshot } = await import("../services/ai/ai-suggestions.service");
  const { vnDay } = await import("../services/kho-suggest");
  const stored: Array<{ khoHash: string | null }> = [];
  const menu = {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async (args: { data: { khoHash: string | null } }) => { stored.push(args.data); return args.data; },
  };
  const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
  const recipes = [{ id: "r1", name: "Trứng xào", ingredients: ["Trứng gà"], mealTypes: [] }];
  const khoA = [{ name: "Trứng", quantity: 6, unit: "PIECE", expiryDate: null }];
  const khoB = [...khoA, { name: "Cà chua", quantity: 2, unit: "PIECE", expiryDate: null }];
  await generateMenu({ ...dayInput, recipes, inventoryItems: khoA }, client);
  await generateMenu({ ...dayInput, recipes, inventoryItems: khoA }, client);
  await generateMenu({ ...dayInput, recipes, inventoryItems: khoB }, client);
  await generateMenu({ ...dayInput, recipes }, client);
  assert.equal(stored[0].khoHash, snapshotHash(khoSnapshot(khoA, vnDay())));
  assert.equal(stored[1].khoHash, stored[0].khoHash);
  assert.notEqual(stored[2].khoHash, stored[0].khoHash);
  assert.equal(stored[3].khoHash, null);
});
