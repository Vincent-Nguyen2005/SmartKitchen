import assert from "node:assert/strict";
import test from "node:test";
import { PeriodType, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateMenu, removeMenuItem } from "../services/menu.service";
import { defaultMealTargets, hasAllergen, type FamilyHealth, type MemberHealth } from "../services/family-health";
import { clearFamilyContextCache, loadFamilyContext, type ContextStore } from "../services/family-context";

const DAY = new Date("2026-11-24T00:00:00.000Z");
const member = (userId: string, name: string, extra: Partial<MemberHealth> = {}): MemberHealth => ({
  userId, name, allergies: [], conditions: [], mealTargets: defaultMealTargets(), ...extra,
});

/** Captures the created menu items. */
function captureClient() {
  const created: Array<{ data: { items: { create: Array<{ recipeId: string | null; dishName: string; mealType: string; details: Record<string, unknown> }> } } }> = [];
  const menu = {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async (args: (typeof created)[number]) => { created.push(args); return { id: "m1", ...args.data, items: args.data.items.create }; },
  };
  const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
  return { client, items: () => created[0]?.data.items.create ?? [] };
}

const lunchOnly = { BREAKFAST: 0, LUNCH: 2, DINNER: 0 };
const dayInput = { userId: "u1", periodType: PeriodType.DAY, startDate: DAY, endDate: DAY };

test("allergy matching: tags accent- and case-insensitive, ingredient names like Kho matching", () => {
  assert.equal(hasAllergen({ ingredients: [{ name: "Tôm sú" }] }, ["tôm"]), true);
  assert.equal(hasAllergen({ ingredients: [{ name: "Gạo" }], allergens: ["Đậu phộng"] }, ["dau phong"]), true);
  // One-word names keep accents: a fish allergy does not exclude tomatoes.
  assert.equal(hasAllergen({ ingredients: [{ name: "Cà chua" }] }, ["Cá"]), false);
  assert.equal(hasAllergen({ ingredients: [{ name: "Cá thu" }] }, ["Cá"]), true);
});

test("a dish any member is allergic to is never picked (ingredient or allergen tag)", async () => {
  const health: FamilyHealth = { members: [member("a", "An", { allergies: ["Tôm"] }), member("b", "Bình", { allergies: ["đậu phộng"] })] };
  const { client, items } = captureClient();
  await generateMenu({
    ...dayInput, health, preferences: { mealTypes: ["LUNCH"] },
    recipes: [
      { id: "shrimp", name: "Tôm rang", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Tôm sú", quantity: 300, unit: "GRAM" }] },
      { id: "peanut", name: "Gà xào sả", role: "man", mealTypes: ["lunch"], allergens: ["Đậu phộng"], ingredientDetails: [{ name: "Thịt gà", quantity: 300, unit: "GRAM" }] },
      { id: "fish", name: "Cá kho", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Cá basa", quantity: 300, unit: "GRAM" }] },
      { id: "soup", name: "Canh bí", role: "canh", mealTypes: ["lunch"], ingredientDetails: [{ name: "Bí xanh", quantity: 300, unit: "GRAM" }] },
    ],
    // Kho favours the excluded dishes; they still never appear.
    inventoryItems: [{ name: "Tôm sú", quantity: 1, unit: "KILOGRAM" }, { name: "Thịt gà", quantity: 1, unit: "KILOGRAM" }],
  }, client);
  assert.deepEqual(items().map((item) => item.recipeId).sort(), ["fish", "soup"]);
});

test("conditions: a dish suitable for everyone wins over a better Kho match that is unsuitable for a member", async () => {
  const health: FamilyHealth = { members: [member("a", "An"), member("b", "Huy", { conditions: ["Tiểu đường"] })] };
  const { client, items } = captureClient();
  await generateMenu({
    ...dayInput, health, preferences: { mealTypes: ["LUNCH"] },
    recipes: [
      { id: "sweet", name: "Thịt kho tàu", role: "man", mealTypes: ["lunch"], contraindications: ["tiểu đường"], ingredientDetails: [{ name: "Thịt ba chỉ", quantity: 300, unit: "GRAM" }] },
      { id: "plain", name: "Gà luộc", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Thịt gà", quantity: 300, unit: "GRAM" }] },
    ],
    inventoryItems: [{ name: "Thịt ba chỉ", quantity: 1, unit: "KILOGRAM" }],
  }, client);
  assert.deepEqual(items().map((item) => item.recipeId), ["plain"]);
  assert.equal(items()[0].details.warnings, undefined);
});

test("unavoidable unsuitable dish: stored with warnings naming the member and one alternative", async () => {
  const health: FamilyHealth = { members: [member("a", "An"), member("b", "Huy", { conditions: ["Tiểu đường"] })] };
  const { client, items } = captureClient();
  await generateMenu({
    ...dayInput, health, preferences: { mealTypes: ["LUNCH"] },
    recipes: [
      { id: "fish", name: "Cá kho", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Cá basa", quantity: 300, unit: "GRAM" }] },
      { id: "pork", name: "Thịt luộc", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Thịt heo", quantity: 300, unit: "GRAM" }] },
      { id: "sweet-soup", name: "Canh bí đỏ hầm", role: "canh", mealTypes: ["lunch"], contraindications: ["Tiểu đường"], ingredientDetails: [{ name: "Bí đỏ", quantity: 300, unit: "GRAM" }] },
    ],
    inventoryItems: [],
  }, client);
  const soup = items().find((item) => item.recipeId === "sweet-soup");
  assert.ok(soup, "the canh slot is filled with the only canh");
  assert.deepEqual(soup.details.warnings, [{ memberUserId: "b", memberName: "Huy", condition: "Tiểu đường" }]);
  const alternative = soup.details.alternative as { recipeId: string; dishName: string };
  const main = items().find((item) => item.recipeId !== "sweet-soup")!;
  assert.ok(["fish", "pork"].includes(alternative.recipeId));
  assert.notEqual(alternative.recipeId, main.recipeId, "the alternative is not a dish already in the day");
  assert.equal(main.details.warnings, undefined);
});

test("calories: portions follow the family target (sum of members' meal targets), rice included", async () => {
  const recipes = [{ id: "light", name: "Gà luộc", role: "man", mealTypes: ["lunch"], calories: 300, ingredientDetails: [{ name: "Thịt gà", quantity: 300, unit: "GRAM" }] }];
  const portions = async (lunchTarget: number) => {
    const health: FamilyHealth = { members: [member("a", "An", { mealTargets: { breakfast: 400, lunch: lunchTarget, dinner: 600 } }), member("b", "Bình", { mealTargets: { breakfast: 400, lunch: lunchTarget, dinner: 600 } })] };
    const { client, items } = captureClient();
    await generateMenu({ ...dayInput, health, preferences: { mealTypes: ["LUNCH"] }, recipes, inventoryItems: [] }, client);
    const main = items()[0].details as { servings: number; riceKcal: number; mealTarget: number };
    return { servings: main.servings, total: main.servings * 300 + main.riceKcal, target: main.mealTarget };
  };
  // Family target 800: rice 280, the dish 2 × 300 → 880 (110 %). Target 2000: rice 700, the dish is capped at
  // 1,5 per person (3 × 300) → 1600 (80 %): no side exists in this catalog, so the meal ends under target instead of
  // inflating the main.
  assert.deepEqual(await portions(400), { servings: 2, total: 880, target: 800 });
  assert.deepEqual(await portions(1000), { servings: 3, total: 1600, target: 2000 });
});

test("swap: the replacement never contains a member's allergen", async () => {
  const health: FamilyHealth = { members: [member("a", "An", { allergies: ["Tôm"] })] };
  const items = [{ id: "i1", recipeId: "fish", dishName: "Cá kho", mealType: "LUNCH", dayOfWeek: 2, details: { role: "man" } }];
  let createdItem: { recipeId: string } | undefined;
  const menuRow = { id: "m1", userId: "u1", familyId: null, periodType: PeriodType.DAY, startDate: DAY, endDate: DAY, items };
  const client = {
    menu: { findFirst: async () => menuRow, findMany: async () => [] },
    removedDish: { create: async () => ({}), findMany: async () => [] },
    menuItem: { delete: async () => ({}), create: async ({ data }: { data: { recipeId: string } }) => { createdItem = data; return data; } },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient;
  await removeMenuItem({
    userId: "u1", menuId: "m1", itemId: "i1", now: new Date("2026-11-24T03:00:00Z"), health, inventoryItems: [{ name: "Tôm sú", quantity: 1, unit: "KILOGRAM" }],
    recipes: [
      { id: "shrimp", name: "Tôm rim", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Tôm sú", quantity: 300, unit: "GRAM" }] },
      { id: "pork", name: "Thịt luộc", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Thịt heo", quantity: 300, unit: "GRAM" }] },
    ],
  }, client);
  assert.equal(createdItem?.recipeId, "pork");
});

/** In-memory last-known-context store. */
function memoryStore(initial: Record<string, MemberHealth[]> = {}): ContextStore & { saved: Record<string, MemberHealth[]> } {
  const saved: Record<string, MemberHealth[]> = { ...initial };
  return { saved, load: async (key) => saved[key] ?? null, save: async (key, members) => { saved[key] = members; } };
}

test("family context: profile service down and no earlier context -> defaults, marked missing, not cached", async () => {
  const oldKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = "test-internal-key-with-more-than-32-characters";
  clearFamilyContextCache();
  let calls = 0;
  const fetchImpl = (async (url: string) => {
    calls += 1;
    if (String(url).includes("/internal/families/")) {
      return new Response(JSON.stringify({ items: [{ userId: "a", name: "An" }, { userId: "b", name: null }] }), { status: 200 });
    }
    throw new Error("nutrition-service down");
  }) as typeof fetch;
  try {
    const store = memoryStore();
    const context = await loadFamilyContext({ userId: "a", familyId: "f1" }, fetchImpl, Date.now(), store);
    assert.equal(context.degraded, true);
    assert.equal(context.missing, true);
    assert.deepEqual(context.members.map((entry) => [entry.userId, entry.name, entry.allergies, entry.mealTargets]), [
      ["a", "An", [], { breakfast: 500, lunch: 800, dinner: 700 }],
      ["b", null, [], { breakfast: 500, lunch: 800, dinner: 700 }],
    ]);
    await loadFamilyContext({ userId: "a", familyId: "f1" }, fetchImpl, Date.now(), store);
    assert.equal(calls, 4, "a degraded result is not cached");
    assert.deepEqual(store.saved, {}, "a degraded result is not saved as the last context");

    // Both services up: profiles applied and cached.
    clearFamilyContextCache();
    let healthyCalls = 0;
    const healthy = (async (url: string) => {
      healthyCalls += 1;
      return String(url).includes("/internal/families/")
        ? new Response(JSON.stringify({ items: [{ userId: "a", name: "An" }] }), { status: 200 })
        : new Response(JSON.stringify({ items: [{ userId: "a", allergies: ["Tôm"], conditions: ["Gout"], mealTargets: { breakfast: { calories: 490 }, lunch: { calories: 784 }, dinner: { calories: 686 } } }] }), { status: 200 });
    }) as typeof fetch;
    const healthyStore = memoryStore();
    const first = await loadFamilyContext({ userId: "a", familyId: "f1" }, healthy, Date.now(), healthyStore);
    assert.equal(first.missing, undefined);
    assert.deepEqual(first.members[0], { userId: "a", name: "An", allergies: ["Tôm"], conditions: ["Gout"], mealTargets: { breakfast: 490, lunch: 784, dinner: 686 } });
    await loadFamilyContext({ userId: "a", familyId: "f1" }, healthy, Date.now(), healthyStore);
    assert.equal(healthyCalls, 2, "cached for a few minutes");
    assert.deepEqual(healthyStore.saved["family:f1"][0].allergies, ["Tôm"], "saved as the last known context");

    // Later both services are down: the last known context (with the allergy) is used, not "no allergies".
    clearFamilyContextCache();
    const down = (async () => { throw new Error("down"); }) as typeof fetch;
    const stale = await loadFamilyContext({ userId: "a", familyId: "f1" }, down, Date.now(), healthyStore);
    assert.equal(stale.degraded, true);
    assert.equal(stale.missing, undefined, "no notice when an earlier context exists");
    assert.deepEqual(stale.members[0].allergies, ["Tôm"]);
  } finally {
    process.env.INTERNAL_API_KEY = oldKey;
    clearFamilyContextCache();
  }
});

test("menu notice flag: set only when no family health data was ever loaded", async () => {
  const recipes = [{ id: "l", name: "Cơm gà", role: "man", mealTypes: ["lunch"], ingredientDetails: [{ name: "Thịt gà", quantity: 300, unit: "GRAM" }] }];
  const flag = async (health: FamilyHealth | undefined) => {
    const created: Array<{ data: { healthUnavailable?: boolean } }> = [];
    const menu = { findMany: async () => [], deleteMany: async () => ({ count: 0 }), create: async (args: (typeof created)[number]) => { created.push(args); return args.data; } };
    const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
    await generateMenu({ ...dayInput, health, preferences: { mealTypes: ["LUNCH"] }, recipes, inventoryItems: [] }, client);
    return created[0].data.healthUnavailable;
  };
  assert.equal(await flag({ members: [member("a", "An")], missing: true }), true);
  assert.equal(await flag({ members: [member("a", "An", { allergies: ["Tôm"] })] }), false);
  assert.equal(await flag(undefined), false);
});
