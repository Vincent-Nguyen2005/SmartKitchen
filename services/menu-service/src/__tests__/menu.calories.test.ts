import assert from "node:assert/strict";
import test from "node:test";
import { PeriodType, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateDays, generateMenu, removeMenuItem } from "../services/menu.service";
import { defaultMealTargets, type FamilyHealth, type MemberHealth } from "../services/family-health";
import { allocatePortions, MAX_SHARE, mealTarget, MIN_SHARE, planMeal, replanServings, RICE_SHARE, riceGrams, servingBounds } from "../services/meal-plan";
import { dishServings } from "../services/portions";
import { computeWeekMissing, dishesInRange } from "../services/week-missing";

const DAY = new Date("2026-11-24T00:00:00.000Z");
const member = (userId: string, targets?: Partial<Record<"breakfast" | "lunch" | "dinner", number>>, extra: Partial<MemberHealth> = {}): MemberHealth => ({
  userId, name: userId, allergies: [], conditions: [], mealTargets: { ...defaultMealTargets(), ...targets }, ...extra,
});
const family4: FamilyHealth = { members: [member("a"), member("b"), member("c"), member("d")] };
const owner4 = { userId: "a", familyId: "f1", role: "OWNER", memberCount: 4 };

type Created = { recipeId: string | null; dishName: string; mealType: string; calories: number | null; details: Record<string, unknown> };
function captureClient() {
  const created: Array<{ data: { servings: number | null; items: { create: Created[] } } }> = [];
  const menu = {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async (args: (typeof created)[number]) => { created.push(args); return { id: `m${created.length}`, ...args.data, items: args.data.items.create }; },
  };
  const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
  return { client, items: () => created.at(-1)?.data.items.create ?? [], menus: () => created };
}
const dayInput = { userId: "a", periodType: PeriodType.DAY, startDate: DAY, endDate: DAY };
const recipe = (id: string, role: string, calories: number, meals: string[], extra: Record<string, unknown> = {}) => ({
  id, name: id, role, calories, mealTypes: meals, servings: 4, cuisine: "vietnam",
  ingredientDetails: [{ name: `NL ${id}`, quantity: 400, unit: "GRAM" }], ...extra,
});
const catalog = [
  recipe("thit-kho", "man", 400, ["lunch", "dinner"]),
  recipe("ca-kho", "man", 300, ["lunch", "dinner"]),
  recipe("canh-bi", "canh", 180, ["lunch", "dinner"]),
  recipe("rau-luoc", "rau", 30, ["lunch", "dinner"]),
  recipe("xao", "xao", 200, ["lunch", "dinner"]),
  recipe("pho", "mot_mon", 500, ["lunch", "dinner"]),
  recipe("banh-mi", "sang", 410, ["breakfast"]),
  recipe("sua", "do_uong", 150, ["breakfast"]),
];
const kcalOf = (items: Created[], meal: string) => items.filter((item) => item.mealType === meal).reduce((sum, item) => sum + (item.calories ?? 0) * (item.details.servings as number), 0);
const riceOf = (items: Created[], meal: string) => items.filter((item) => item.mealType === meal).reduce((sum, item) => sum + (typeof item.details.riceKcal === "number" ? item.details.riceKcal : 0), 0);

test("family target: sum of members' meal targets; defaults for members without a profile; nobody → defaults × people", () => {
  const health: FamilyHealth = { members: [member("a", { lunch: 900 }), member("b", { lunch: 700 }), { ...member("c"), mealTargets: {} as never }] };
  // c has no profile targets: 2000 × 40 % = 800.
  assert.equal(mealTarget(health, "LUNCH", 3), 900 + 700 + 800);
  assert.equal(mealTarget(undefined, "BREAKFAST", 4), 4 * 500);
  assert.equal(mealTarget({ members: [] }, "DINNER", 2), 2 * 700);
  assert.equal(mealTarget(family4, "SNACK", 4), 0);
});

test("portions: shares by role within per-person bounds, sum within 90–115 % of the target", () => {
  // Lunch for 4 (3200 kcal): rice 35 %, dishes 2080 kcal split main / vegetable.
  const target = 3200;
  const dishTarget = target * (1 - RICE_SHARE);
  const servings = allocatePortions([{ kcal: 400, slot: "main" }, { kcal: 180, slot: "veg" }], dishTarget, 4);
  const total = 400 * servings[0] + 180 * servings[1] + target * RICE_SHARE;
  assert.ok(total >= MIN_SHARE * target && total <= MAX_SHARE * target, `total ${total}`);
  assert.ok(servings[0] >= servingBounds("main", 4)[0] && servings[0] <= servingBounds("main", 4)[1]);
  // A 30 kcal vegetable never turns into 20 phần: at most 1,5 per person.
  const low = allocatePortions([{ kcal: 400, slot: "main" }, { kcal: 30, slot: "veg" }], dishTarget, 4);
  assert.ok(low[1] <= 6, `vegetable ${low[1]}`);
  // A meal never aims above the target: heavy dishes at minimum portions only.
  const heavy = allocatePortions([{ kcal: 900, slot: "main" }], 1000, 4);
  assert.ok(900 * heavy[0] <= Math.max(1000 * MAX_SHARE, 900), `heavy ${heavy[0]}`);
});

test("breakfast with one dish: one serving per member, adjusted slightly towards the target", () => {
  assert.deepEqual(allocatePortions([{ kcal: 500, slot: "breakfast_single" }], 2000, 4), [4]);
  // 410 kcal × 4 = 1640 < 2000 → 5 (max 1,25 per person).
  assert.deepEqual(allocatePortions([{ kcal: 410, slot: "breakfast_single" }], 2000, 4), [5]);
  // Very light dish: never more than +25 %.
  assert.deepEqual(allocatePortions([{ kcal: 100, slot: "breakfast_single" }], 2000, 4), [5]);
  // Even 3 servings of a 900 kcal dish would pass 115 %: portions shrink (the planner's fit tie-break avoids such dishes).
  assert.deepEqual(allocatePortions([{ kcal: 900, slot: "breakfast_single" }], 2000, 4), [2]);
});

test("dish count adapts to the target: a side or a drink only when the meal stays under 90 %", () => {
  const pickFrom = (dishes: Array<{ id: string; role: string; kcal: number }>) => {
    const used = new Set<string>();
    return (roles: Array<string | null>) => {
      const found = dishes.find((dish) => !used.has(dish.id) && roles.includes(dish.role));
      if (!found) return null;
      used.add(found.id);
      return { value: found.id, role: found.role, kcal: found.kcal };
    };
  };
  const enough = planMeal("LUNCH", 4, 3200, pickFrom([{ id: "man", role: "man", kcal: 400 }, { id: "canh", role: "canh", kcal: 180 }, { id: "xao", role: "xao", kcal: 200 }]));
  assert.deepEqual(enough.dishes.map((dish) => dish.pick), ["man", "canh"]);
  // A light main and a light vegetable cannot reach 90 % → a side is added.
  const light = planMeal("LUNCH", 4, 3200, pickFrom([{ id: "man", role: "man", kcal: 150 }, { id: "rau", role: "rau", kcal: 30 }, { id: "xao", role: "xao", kcal: 250 }]));
  assert.deepEqual(light.dishes.map((dish) => dish.pick), ["man", "rau", "xao"]);
  assert.ok(light.kcal <= MAX_SHARE * 3200);
  // Breakfast: one dish when it is enough, a drink otherwise.
  assert.deepEqual(planMeal("BREAKFAST", 4, 2000, pickFrom([{ id: "xoi", role: "sang", kcal: 520 }, { id: "sua", role: "do_uong", kcal: 150 }])).dishes.map((dish) => dish.pick), ["xoi"]);
  assert.deepEqual(planMeal("BREAKFAST", 4, 2000, pickFrom([{ id: "chao", role: "sang", kcal: 250 }, { id: "sua", role: "do_uong", kcal: 150 }])).dishes.map((dish) => dish.pick), ["chao", "sua"]);
  // One-dish meal (phở): no rice, no vegetable unless short.
  const pho = planMeal("DINNER", 4, 2800, pickFrom([{ id: "pho", role: "mot_mon", kcal: 500 }]));
  assert.equal(pho.riceKcal, 0);
  assert.deepEqual(pho.dishes.map((dish) => dish.pick), ["pho"]);
});

test("generated day: 1–2 breakfast dishes, 2–3 lunch / dinner dishes, kcal within 90–115 % of each meal's target", async () => {
  const { client, items } = captureClient();
  await generateMenu({ ...dayInput, owner: owner4, health: family4, recipes: catalog, inventoryItems: [] }, client);
  const list = items();
  for (const meal of ["BREAKFAST", "LUNCH", "DINNER"]) {
    const count = list.filter((item) => item.mealType === meal).length;
    const target = mealTarget(family4, meal, 4);
    const kcal = kcalOf(list, meal) + riceOf(list, meal);
    assert.ok(meal === "BREAKFAST" ? count >= 1 && count <= 2 : count >= 2 && count <= 3, `${meal}: ${count} dishes`);
    assert.ok(kcal >= MIN_SHARE * target && kcal <= MAX_SHARE * target, `${meal}: ${kcal} / ${target}`);
    for (const item of list.filter((entry) => entry.mealType === meal)) assert.ok(Number.isInteger(item.details.servings) && (item.details.servings as number) >= 1);
  }
  // The meal's first dish carries the target (and the rice share for meals with món mặn).
  const lunch = list.filter((item) => item.mealType === "LUNCH");
  assert.equal(lunch[0].details.mealTarget, mealTarget(family4, "LUNCH", 4));
});

test("Kho first: the dish whose ingredients are in Kho (earliest expiry first) wins its slot", async () => {
  // Expiry is counted from the real today (generation uses it); both mains have the same kcal.
  const soon = new Date(Date.now() + 1 * 86_400_000).toISOString();
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const mains = [recipe("thit-kho", "man", 350, ["lunch"]), recipe("ca-kho", "man", 350, ["lunch"]), recipe("ga-luoc", "man", 350, ["lunch"]), recipe("canh-bi", "canh", 180, ["lunch"])];
  const run = async (fishExpiry: string, porkExpiry: string) => {
    const { client, items } = captureClient();
    await generateMenu({
      ...dayInput, owner: owner4, health: family4, recipes: mains, preferences: { mealTypes: ["LUNCH"] },
      inventoryItems: [{ name: "NL thit-kho", quantity: 5, unit: "KILOGRAM", expiryDate: porkExpiry }, { name: "NL ca-kho", quantity: 5, unit: "KILOGRAM", expiryDate: fishExpiry }],
    }, client);
    return items();
  };
  // Both mains are fully covered by Kho (Gà luộc is not): the one expiring sooner wins.
  assert.equal((await run(soon, later)).find((item) => item.details.role === "man")?.recipeId, "ca-kho");
  const items = async () => run(later, soon);
  assert.equal((await items()).find((item) => item.details.role === "man")?.recipeId, "thit-kho");
  // Stored Kho match uses the planned portions.
  const main = (await items()).find((item) => item.details.role === "man")!;
  assert.deepEqual(main.details.missingIngredients, []);
});

test("health and cuisine rules still apply: allergens never, unsuitable dishes only as a fallback, at most one foreign dish per meal", async () => {
  const health: FamilyHealth = { members: [member("a", {}, { allergies: ["Tôm"] }), member("b", {}, { conditions: ["Gout"] })] };
  const recipes = [
    recipe("tom", "man", 350, ["lunch"], { ingredientDetails: [{ name: "Tôm sú", quantity: 300, unit: "GRAM" }] }),
    recipe("bo", "man", 450, ["lunch"], { contraindications: ["gout"] }),
    recipe("ga", "man", 380, ["lunch"]),
    recipe("steak", "man", 500, ["lunch"], { cuisine: "western" }),
    recipe("salad", "rau", 120, ["lunch"], { cuisine: "western" }),
    recipe("canh", "canh", 160, ["lunch"]),
    recipe("xao", "xao", 220, ["lunch"]),
  ];
  const { client, items } = captureClient();
  await generateMenu({
    ...dayInput, owner: { ...owner4, memberCount: 2 }, health, recipes, preferences: { mealTypes: ["LUNCH"] },
    inventoryItems: [{ name: "Tôm sú", quantity: 2, unit: "KILOGRAM" }, { name: "NL bo", quantity: 2, unit: "KILOGRAM" }],
  }, client);
  const ids = items().map((item) => item.recipeId);
  assert.equal(ids.includes("tom"), false);
  assert.equal(ids.includes("bo"), false);
  assert.ok(items().filter((item) => ["steak", "salad"].includes(item.recipeId ?? "")).length <= 1);
});

test("weekly missing list and Kho amounts use the planned portions, not the family size per dish", () => {
  const recipes = [{ id: "r1", name: "Canh", ingredients: [], details: [{ name: "Bí", quantity: 400, unit: "GRAM" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role: "canh", servings: 4, allergens: [], contraindications: [], cuisine: null }];
  const menus = [{ startDate: DAY, servings: 4, items: [
    { recipeId: "r1", dayOfWeek: 2, details: { servings: 2 } },
    // An older dish without planned portions: the menu's people.
    { recipeId: "r1", dayOfWeek: 2, details: { role: "canh" } },
  ] }];
  const dishes = dishesInRange(menus, recipes, { from: "2026-11-24", to: "2026-11-30" });
  assert.deepEqual(dishes.map((dish) => dish.people), [2, 4]);
  const missing = computeWeekMissing({ dishes: dishes.slice(0, 1), kho: [], catalog: [], today: "2026-11-24" });
  assert.equal(missing[0].quantity, 200);
  assert.equal(dishServings({ servings: 3 }, 4), 3);
  assert.equal(dishServings(null, null, 5), 5);
});

test("swapping a dish re-sizes the meal's portions towards the same target (catalog or AI dish)", async () => {
  const items = [
    { id: "i1", recipeId: "thit-kho", dishName: "thit-kho", mealType: "LUNCH", dayOfWeek: 2, calories: 400, details: { role: "man", servings: 3, mealTarget: 3200, riceKcal: 1120 } },
    { id: "i2", recipeId: "canh-bi", dishName: "canh-bi", mealType: "LUNCH", dayOfWeek: 2, calories: 180, details: { role: "canh", servings: 4 } },
  ];
  const menu = { id: "m1", familyId: "f1", userId: "a", servings: 4, startDate: DAY, endDate: DAY, periodType: PeriodType.DAY, items };
  const ops: string[] = [];
  const created: Array<{ data: { recipeId: string | null; details: Record<string, unknown> } }> = [];
  const client = {
    menu: { findFirst: async () => menu, findMany: async () => [] },
    removedDish: { create: async () => ({}), findMany: async () => [] },
    menuItem: {
      delete: (args: unknown) => { ops.push("delete"); return args; },
      create: (args: (typeof created)[number]) => { created.push(args); ops.push("create"); return args; },
      update: (args: unknown) => { ops.push("update"); return args; },
    },
    $transaction: async (list: unknown[]) => list,
  } as unknown as PrismaClient;
  const withSoups = [...catalog, recipe("canh-ga", "canh", 220, ["lunch", "dinner"])];
  await removeMenuItem({ userId: "a", owner: owner4, health: family4, menuId: "m1", itemId: "i2", now: DAY, recipes: withSoups, inventoryItems: [] }, client);
  const replacement = created[0].data;
  assert.equal(typeof replacement.details.servings, "number");
  assert.equal(replacement.recipeId, "canh-ga");
  const { servings } = replanServings("LUNCH", [{ role: "man", kcal: 400 }, { role: "canh", kcal: 220 }], 4, mealTarget(family4, "LUNCH", 4));
  assert.equal(replacement.details.servings, servings[1]);
});

test("Tạo lại tuần: replace regenerates days that already have a menu (past days still untouched)", async () => {
  const { client, menus } = captureClient();
  const existing = { menu: { ...(client as unknown as { menu: Record<string, unknown> }).menu, findMany: async () => [{ startDate: DAY, items: [] }] } };
  const replacing = { ...(client as unknown as Record<string, unknown>), ...existing } as unknown as PrismaClient;
  const input = { userId: "a", owner: owner4, health: family4, recipes: catalog, inventoryItems: [], days: ["2026-11-23", "2026-11-24"], now: DAY };
  assert.equal((await generateDays(input, replacing)).length, 0);
  assert.equal((await generateDays({ ...input, replace: true }, replacing)).length, 1);
  assert.equal(menus().length, 1);
});

test("variety across the week: with fewer dishes per meal, no dish twice within 2 days in any meal, at most twice a week", async () => {
  const many = [
    ...Array.from({ length: 10 }, (_, index) => recipe(`man-${index}`, "man", 350 + index * 10, ["lunch", "dinner"])),
    ...Array.from({ length: 8 }, (_, index) => recipe(`canh-${index}`, "canh", 160 + index * 5, ["lunch", "dinner"])),
    ...Array.from({ length: 6 }, (_, index) => recipe(`sang-${index}`, "sang", 450 + index * 10, ["breakfast"])),
  ];
  // Saved days so far: each generated day sees the earlier ones (as the menu DB would return them).
  const saved: Array<{ startDate: Date; endDate: Date; items: Created[] }> = [];
  const { client } = captureClient();
  const withHistory = { ...(client as unknown as Record<string, unknown>), menu: { ...(client as unknown as { menu: Record<string, unknown> }).menu, findMany: async () => saved } } as unknown as PrismaClient;
  const days: string[][] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(DAY.getTime() + offset * 86_400_000);
    const menu = await generateMenu({ ...dayInput, startDate: date, endDate: date, owner: owner4, health: family4, recipes: many, inventoryItems: [] }, withHistory) as unknown as { items: Created[] };
    saved.push({ startDate: date, endDate: date, items: menu.items.map((item) => ({ ...item, dayOfWeek: ((date.getUTCDay() + 6) % 7) + 1 })) as Created[] });
    days.push(menu.items.map((item) => item.recipeId as string));
  }
  const counts = new Map<string, number>();
  days.flat().forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  assert.ok([...counts.values()].every((count) => count <= 2), JSON.stringify([...counts]));
  for (let index = 1; index < days.length; index += 1) {
    const near = new Set([...days[index - 1], ...(days[index - 2] ?? [])]);
    assert.equal(days[index].filter((id) => near.has(id)).length, 0, `day ${index}`);
  }
});

test("a breakfast drink is chosen to add energy (milk), not a near-zero drink (green tea)", async () => {
  const { client, items } = captureClient();
  await generateMenu({
    ...dayInput, owner: owner4, health: family4, preferences: { mealTypes: ["BREAKFAST"] }, inventoryItems: [],
    recipes: [recipe("chao", "sang", 250, ["breakfast"]), recipe("tra", "do_uong", 2, ["breakfast"]), recipe("sua", "do_uong", 150, ["breakfast"])],
  }, client);
  assert.deepEqual(items().map((item) => item.recipeId), ["chao", "sua"]);
});

test("rice as a planned ingredient: raw Gạo grams = rice kcal ÷ 3,25 (cooked 130 kcal / 100 g × 2,5), up to 10 g", async () => {
  assert.equal(riceGrams(1204), 380);
  assert.equal(riceGrams(325), 100);
  assert.equal(riceGrams(0), 0);
  const { client, items } = captureClient();
  await generateMenu({ ...dayInput, owner: owner4, health: family4, recipes: catalog, inventoryItems: [] }, client);
  const list = items();
  for (const meal of ["LUNCH", "DINNER"]) {
    const dishes = list.filter((item) => item.mealType === meal);
    const carriers = dishes.filter((item) => typeof item.details.riceGrams === "number");
    if (dishes[0].details.role === "man") {
      // Exactly one dish per meal carries the rice: the món mặn.
      assert.equal(carriers.length, 1, meal);
      assert.equal(carriers[0].details.role, "man");
      assert.equal(carriers[0].details.riceGrams, riceGrams(carriers[0].details.riceKcal as number));
    } else {
      assert.equal(carriers.length, 0, meal);
    }
  }
  assert.equal(list.filter((item) => item.mealType === "BREAKFAST").some((item) => item.details.riceGrams), false);
});

test("Cần mua tuần này: the meal's rice counts once as Gạo, converted to the catalog's kg", () => {
  const recipes = [{ id: "r1", name: "Thịt kho", ingredients: [], details: [{ name: "Thịt ba chỉ", quantity: 400, unit: "GRAM" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role: "man", servings: 4, allergens: [], contraindications: [], cuisine: null }];
  const menus = [{ startDate: DAY, servings: 4, items: [
    { recipeId: "r1", dayOfWeek: 2, details: { role: "man", servings: 4, riceKcal: 1204, riceGrams: 380 } },
    { recipeId: "r1", dayOfWeek: 2, details: { role: "man", servings: 4, riceKcal: 1054, riceGrams: 330 } },
  ] }];
  const dishes = dishesInRange(menus, recipes, { from: "2026-11-24", to: "2026-11-30" });
  const catalogGao = [{ id: "gao", name: "Gạo", unit: "KILOGRAM", imageUrl: null, price: 20000, discountPercent: null }];
  const missing = computeWeekMissing({ dishes, kho: [{ name: "Gạo", quantity: 0.5, unit: "KILOGRAM", expiryDate: null }], catalog: catalogGao, today: "2026-11-24" });
  const gao = missing.find((entry) => entry.name === "Gạo")!;
  // 380 g + 330 g = 0,71 kg needed, 0,5 kg in Kho → 0,3 kg to buy (0,1 kg steps, rounded up).
  assert.equal(gao.unit, "KILOGRAM");
  assert.equal(gao.quantity, 0.3);
});

test("swapping the món mặn moves the meal's rice to the new món mặn", async () => {
  const items = [
    { id: "i1", recipeId: "thit-kho", dishName: "thit-kho", mealType: "LUNCH", dayOfWeek: 2, calories: 400, details: { role: "man", servings: 3, mealTarget: 3200, riceKcal: 1120, riceGrams: 350 } },
    { id: "i2", recipeId: "canh-bi", dishName: "canh-bi", mealType: "LUNCH", dayOfWeek: 2, calories: 180, details: { role: "canh", servings: 4 } },
  ];
  const menu = { id: "m1", familyId: "f1", userId: "a", servings: 4, startDate: DAY, endDate: DAY, periodType: PeriodType.DAY, items };
  const created: Array<{ data: { recipeId: string | null; details: Record<string, unknown> } }> = [];
  const updates: Array<{ data: { details: Record<string, unknown> } }> = [];
  const client = {
    menu: { findFirst: async () => menu, findMany: async () => [] },
    removedDish: { create: async () => ({}), findMany: async () => [] },
    menuItem: { delete: (args: unknown) => args, create: (args: (typeof created)[number]) => { created.push(args); return args; }, update: (args: (typeof updates)[number]) => { updates.push(args); return args; } },
    $transaction: async (list: unknown[]) => list,
  } as unknown as PrismaClient;
  await removeMenuItem({ userId: "a", owner: owner4, health: family4, menuId: "m1", itemId: "i1", now: DAY, recipes: catalog, inventoryItems: [] }, client);
  const replacement = created[0].data;
  assert.equal(replacement.details.role, "man");
  assert.equal(typeof replacement.details.riceGrams, "number");
  assert.ok((replacement.details.riceGrams as number) > 0);
  // The soup does not get the rice.
  assert.equal(updates.every((update) => update.data.details.riceGrams === undefined), true);
});

test("sensible combinations: foreign main without Vietnamese canh / rau or rice; one-plate dishes alone; rice only with a Vietnamese món mặn", () => {
  type Dish = { id: string; role: string; kcal: number; cuisine: string };
  const pickFrom = (dishes: Dish[]) => {
    const used = new Set<string>();
    return (roles: Array<string | null>, _slot: unknown, constraint: { cuisine?: string; maxKcal?: number }) => {
      const found = dishes.find((dish) => !used.has(dish.id) && roles.includes(dish.role)
        && (constraint.cuisine === undefined || dish.cuisine === constraint.cuisine) && (constraint.maxKcal === undefined || dish.kcal <= constraint.maxKcal));
      if (!found) return null;
      used.add(found.id);
      return { value: found.id, role: found.role, kcal: found.kcal, cuisine: found.cuisine };
    };
  };
  const vnSides: Dish[] = [{ id: "canh-chua", role: "canh", kcal: 150, cuisine: "vietnam" }, { id: "rau-muong", role: "rau", kcal: 40, cuisine: "vietnam" }, { id: "dau-xao", role: "xao", kcal: 200, cuisine: "vietnam" }];
  // Foreign main (Korean chicken): no Vietnamese canh, no rice; a Korean side only when short.
  const korean = planMeal("LUNCH", 4, 3200, pickFrom([{ id: "ga-han", role: "man", kcal: 400, cuisine: "asian" }, ...vnSides, { id: "canh-kimchi", role: "canh", kcal: 190, cuisine: "asian" }]));
  assert.equal(korean.riceKcal, 0);
  assert.ok(korean.dishes.every((dish) => !["canh-chua", "rau-muong", "dau-xao"].includes(dish.pick)), korean.dishes.map((dish) => dish.pick).join());
  // 400 × 8 (2 per person) = 3200: enough, so no side.
  assert.deepEqual(korean.dishes.map((dish) => dish.pick), ["ga-han"]);
  const lightKorean = planMeal("LUNCH", 4, 3200, pickFrom([{ id: "trung-cuon", role: "man", kcal: 190, cuisine: "asian" }, ...vnSides, { id: "canh-kimchi", role: "canh", kcal: 190, cuisine: "asian" }]));
  assert.deepEqual(lightKorean.dishes.map((dish) => dish.pick), ["trung-cuon", "canh-kimchi"]);
  // One-plate (Bò bít tết with fries): alone, no rice; a light western side only when short, never a Vietnamese one.
  const steak = planMeal("DINNER", 4, 2800, pickFrom([{ id: "bo-bit-tet", role: "mot_mon", kcal: 600, cuisine: "western" }, ...vnSides, { id: "salad", role: "rau", kcal: 125, cuisine: "western" }]));
  assert.equal(steak.riceKcal, 0);
  assert.deepEqual(steak.dishes.map((dish) => dish.pick), ["bo-bit-tet"]);
  const pho = planMeal("DINNER", 4, 2800, pickFrom([{ id: "bun-moc", role: "mot_mon", kcal: 300, cuisine: "vietnam" }, { id: "che", role: "canh", kcal: 400, cuisine: "vietnam" }, ...vnSides]));
  // Short (300 × 8 = 2400 < 90 %): one LIGHT Vietnamese side (≤ 250 kcal), not the 400 kcal one; still no rice.
  assert.equal(pho.riceKcal, 0);
  assert.deepEqual(pho.dishes.map((dish) => dish.pick), ["bun-moc", "canh-chua"]);
  // Vietnamese món mặn: a Vietnamese canh / rau and rice.
  const vn = planMeal("LUNCH", 4, 3200, pickFrom([{ id: "thit-kho", role: "man", kcal: 400, cuisine: "vietnam" }, { id: "salad", role: "rau", kcal: 125, cuisine: "western" }, ...vnSides]));
  assert.ok(vn.riceKcal > 0);
  assert.deepEqual(vn.dishes.map((dish) => dish.pick).slice(0, 2), ["thit-kho", "canh-chua"]);
  // After a swap: rice only when the meal's món mặn is Vietnamese.
  assert.equal(replanServings("LUNCH", [{ role: "man", kcal: 400, cuisine: "asian" }, { role: "canh", kcal: 190, cuisine: "asian" }], 4, 3200).riceKcal, 0);
  assert.ok(replanServings("LUNCH", [{ role: "man", kcal: 400, cuisine: "vietnam" }, { role: "canh", kcal: 150, cuisine: "vietnam" }], 4, 3200).riceKcal > 0);
  assert.equal(replanServings("LUNCH", [{ role: "mot_mon", kcal: 600, cuisine: "western" }], 4, 3200).riceKcal, 0);
});

test("older saved menus (rice kcal only): Gạo counts only when the meal's món mặn is Vietnamese", () => {
  const recipe = (id: string, role: string, cuisine: string) => ({ id, name: id, ingredients: [], details: [{ name: `NL ${id}`, quantity: 400, unit: "GRAM" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role, servings: 4, allergens: [], contraindications: [], cuisine });
  const recipes = [recipe("bo-kho", "man", "vietnam"), recipe("ga-han", "man", "asian"), recipe("bo-bit-tet", "mot_mon", "western")];
  const menus = [{ startDate: DAY, servings: 4, items: [
    { recipeId: "bo-kho", dayOfWeek: 2, details: { role: "man", servings: 2, riceKcal: 1054 } },
    { recipeId: "ga-han", dayOfWeek: 2, details: { role: "man", servings: 4, riceKcal: 1204 } },
    { recipeId: "bo-bit-tet", dayOfWeek: 2, details: { role: "mot_mon", servings: 2, riceKcal: 1054 } },
  ] }];
  const rice = dishesInRange(menus, recipes, { from: "2026-11-24", to: "2026-11-30" }).filter((dish) => dish.ingredients[0].name === "Gạo");
  // Only Bò kho's meal: 1054 ÷ 3,25 → 330 g.
  assert.deepEqual(rice.map((dish) => dish.ingredients[0].quantity), [330]);
});
