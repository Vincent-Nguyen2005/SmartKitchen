import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, type PrismaClient } from "../../node_modules/.prisma/client-menu";
import { settingsSchema } from "../controllers/menu.controller";
import { generateMenu, isPastDay, MenuServiceError, removeMenuItem } from "../services/menu.service";
import { roleSlots } from "../services/kho-suggest";
import type { AiDish } from "../services/ai/gemini";

const r = (id: string, role: string, mealTypes: string[], ingredients: string[] = [id]) => ({ id, name: id, role, mealTypes, ingredients, calories: 200 });
const catalog = [
  r("pho", "mot_mon", ["breakfast", "lunch"]), r("xoi", "sang", ["breakfast"]), r("chao", "sang", ["breakfast"]), r("banhmi", "sang", ["breakfast"]),
  r("sua", "do_uong", ["breakfast"]), r("cam", "do_uong", ["breakfast"]),
  r("thitkho", "man", ["lunch", "dinner"], ["Thịt ba chỉ", "Trứng gà"]), r("cakho", "man", ["lunch", "dinner"], ["Cá basa"]), r("gakho", "man", ["lunch", "dinner"], ["Thịt gà"]),
  r("canhchua", "canh", ["lunch", "dinner"]), r("canhbi", "canh", ["lunch", "dinner"]), r("canhrau", "canh", ["lunch", "dinner"]),
  r("raumuong", "rau", ["lunch", "dinner"]), r("bapcai", "rau", ["lunch", "dinner"]),
  r("boxao", "xao", ["lunch", "dinner"]), r("mucxao", "xao", ["lunch", "dinner"]),
  r("chuoi", "trang_mieng", ["lunch", "dinner"]), r("duahau", "trang_mieng", ["lunch", "dinner"]),
];
const counts = { BREAKFAST: 3, LUNCH: 5, DINNER: 5 };
type Created = { recipeId: string; mealType: MealType; details: { role: string } };

function createClient() {
  const created: Array<{ data: { items: { create: Created[] } } }> = [];
  const menu = {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async (args: (typeof created)[number]) => { created.push(args); return args; },
  };
  return { created, client: { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient };
}

test("meal slots: breakfast light dishes plus a drink; lunch/dinner món mặn, canh, rau, xào, tráng miệng", () => {
  assert.deepEqual(roleSlots("BREAKFAST", 3), ["sang", "sang", "do_uong"]);
  assert.deepEqual(roleSlots("BREAKFAST", 1), ["sang"]);
  assert.deepEqual(roleSlots("LUNCH", 5), ["man", "canh", "rau", "xao", "trang_mieng"]);
  assert.deepEqual(roleSlots("DINNER", 3), ["man", "canh", "rau"]);
  assert.deepEqual(roleSlots("LUNCH", 6), ["man", "canh", "rau", "xao", "trang_mieng", "man"]);
  assert.equal(settingsSchema.safeParse({ breakfast: 3, lunch: 5, dinner: 5 }).success, true);
  assert.equal(settingsSchema.safeParse({ breakfast: 0, lunch: 5, dinner: 5 }).success, false);
  assert.equal(settingsSchema.safeParse({ breakfast: 3, lunch: 7, dinner: 5 }).success, false);
});

test("day menu sizes: 3 / 5 / 5 dishes, family-meal roles, no dish twice in the day, Kho dishes first", async () => {
  const { created, client } = createClient();
  await generateMenu({
    userId: "u1", periodType: PeriodType.DAY, startDate: new Date("2026-11-24T00:00:00Z"), endDate: new Date("2026-11-24T00:00:00Z"),
    recipes: catalog, inventoryItems: [{ name: "Thịt ba chỉ", quantity: 1, unit: "KILOGRAM" }, { name: "Trứng gà", quantity: 6, unit: "PIECE" }],
    mealCounts: counts,
  }, client);
  const items = created[0].data.items.create;
  const meal = (type: MealType) => items.filter((item) => item.mealType === type);
  assert.equal(meal(MealType.BREAKFAST).length, 3);
  assert.equal(meal(MealType.LUNCH).length, 5);
  assert.equal(meal(MealType.DINNER).length, 5);
  assert.deepEqual(meal(MealType.LUNCH).map((item) => item.details.role), ["man", "canh", "rau", "xao", "trang_mieng"]);
  assert.equal(meal(MealType.BREAKFAST)[2].details.role, "do_uong");
  assert.equal(new Set(items.map((item) => item.recipeId)).size, items.length);
  // The dish whose ingredients are in Kho wins the first món mặn slot.
  assert.equal(meal(MealType.LUNCH)[0].recipeId, "thitkho");
});

test("dislike history: recently removed dishes are not picked while others fit", async () => {
  const { created, client } = createClient();
  await generateMenu({
    userId: "u1", periodType: PeriodType.DAY, startDate: new Date("2026-11-24T00:00:00Z"), endDate: new Date("2026-11-24T00:00:00Z"),
    recipes: catalog, inventoryItems: [{ name: "Thịt ba chỉ", quantity: 1, unit: "KILOGRAM" }],
    mealCounts: { BREAKFAST: 1, LUNCH: 1, DINNER: 1 }, excludeRecipeIds: ["thitkho", "xoi"],
  }, client);
  const ids = created[0].data.items.create.map((item) => item.recipeId);
  assert.ok(!ids.includes("thitkho") && !ids.includes("xoi"), ids.join());
  assert.equal(ids.length, 3);
});

type Item = { id: string; recipeId: string | null; dishName: string; mealType: MealType; dayOfWeek: number; details: unknown };

function removeClient(items: Item[], options: { startDate?: string; removedBefore?: Array<{ recipeId: string | null; dishName: string }> } = {}) {
  const menuRow = { id: "m1", userId: "u1", familyId: "f1", periodType: PeriodType.DAY, startDate: new Date(options.startDate ?? "2026-11-24T00:00:00Z"), endDate: new Date(options.startDate ?? "2026-11-24T00:00:00Z"), items };
  const removedRows = [...(options.removedBefore ?? []).map((row) => ({ ...row, removedAt: new Date() }))];
  const writes: string[] = [];
  const client = {
    menu: { findFirst: async () => ({ ...menuRow, items: [...items] }) },
    removedDish: {
      create: async ({ data }: { data: { recipeId: string | null; dishName: string } }) => { removedRows.push({ ...data, removedAt: new Date() }); writes.push(`removed:${data.dishName}`); return data; },
      findMany: async () => removedRows,
    },
    menuItem: {
      delete: ({ where }: { where: { id: string } }) => { writes.push(`delete:${where.id}`); const index = items.findIndex((item) => item.id === where.id); items.splice(index, 1); return Promise.resolve({}); },
      create: ({ data }: { data: Item }) => { writes.push(`create:${data.dishName}`); items.push({ ...data, id: `new-${data.dishName}` }); return Promise.resolve({}); },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;
  return { client, writes, removedRows, items };
}

const item = (id: string, recipeId: string, mealType: MealType, role: string): Item => ({ id, recipeId, dishName: recipeId, mealType, dayOfWeek: 2, details: { role } });
const now = new Date("2026-11-24T03:00:00Z");

test("remove a dish: one replacement with the same meal and role, best Kho score, never a dish already in the day or removed recently", async () => {
  const items = [item("i1", "thitkho", MealType.LUNCH, "man"), item("i2", "cakho", MealType.DINNER, "man"), item("i3", "canhchua", MealType.LUNCH, "canh")];
  const { client, writes, removedRows } = removeClient(items, { removedBefore: [{ recipeId: "boxao", dishName: "boxao" }] });
  await removeMenuItem({ userId: "u1", menuId: "m1", itemId: "i1", now, recipes: catalog, inventoryItems: [{ name: "Thịt gà", quantity: 1, unit: "KILOGRAM" }] }, client);
  // cakho is already in the day, thitkho was just removed: the remaining món mặn is gakho (also in Kho).
  assert.deepEqual(writes, ["removed:thitkho", "delete:i1", "create:gakho"]);
  assert.ok(removedRows.some((row) => row.recipeId === "thitkho"));
  // Other dishes are untouched (no whole-day regeneration).
  assert.deepEqual(items.map((entry) => entry.recipeId).sort(), ["cakho", "canhchua", "gakho"]);
  const created = items.find((entry) => entry.recipeId === "gakho");
  assert.equal(created?.mealType, MealType.LUNCH);
  assert.equal((created?.details as { role: string }).role, "man");
});

test("remove a dish: no catalog dish fits -> an AI suggestion for that meal fills the slot; nothing at all -> slot stays empty", async () => {
  const onlyOneXao = catalog.filter((recipe) => recipe.role !== "xao" || recipe.id === "boxao");
  const aiDish: AiDish = { id: "ai-1", name: "Rau củ xào thập cẩm", description: "", mealType: "trua", servings: 2, totalMinutes: 15, ingredients: [{ name: "Cà rốt", quantity: 1, unit: "PIECE", fromKho: true }], steps: [{ order: 1, instruction: "Xào", durationSeconds: 120, ingredients: [] }] };
  const dinnerAi: AiDish = { ...aiDish, id: "ai-2", name: "Món tối", mealType: "toi" };

  const first = removeClient([item("i1", "boxao", MealType.LUNCH, "xao")]);
  await removeMenuItem({ userId: "u1", menuId: "m1", itemId: "i1", now, recipes: onlyOneXao, inventoryItems: [], aiDishes: async () => [dinnerAi, aiDish] }, first.client);
  assert.deepEqual(first.writes, ["removed:boxao", "delete:i1", "create:Rau củ xào thập cẩm"]);
  assert.equal((first.items[0].details as { ai: boolean }).ai, true);

  const second = removeClient([item("i1", "boxao", MealType.LUNCH, "xao")]);
  await removeMenuItem({ userId: "u1", menuId: "m1", itemId: "i1", now, recipes: onlyOneXao, inventoryItems: [], aiDishes: async () => [dinnerAi] }, second.client);
  assert.deepEqual(second.writes, ["removed:boxao", "delete:i1"]);
  assert.equal(second.items.length, 0);
});

test("past days are never edited or regenerated", async () => {
  assert.equal(isPastDay(new Date("2026-11-23T00:00:00Z"), now), true);
  assert.equal(isPastDay(new Date("2026-11-24T00:00:00Z"), now), false);
  assert.equal(isPastDay(new Date("2026-11-25T00:00:00Z"), now), false);
  const { client, writes } = removeClient([item("i1", "thitkho", MealType.LUNCH, "man")], { startDate: "2026-11-20T00:00:00Z" });
  await assert.rejects(removeMenuItem({ userId: "u1", menuId: "m1", itemId: "i1", now, recipes: catalog, inventoryItems: [] }, client),
    (error: unknown) => error instanceof MenuServiceError && error.statusCode === 422);
  assert.deepEqual(writes, []);
});
