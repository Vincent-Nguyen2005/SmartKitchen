import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, type PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateMenu, removeMenuItem } from "../services/menu.service";
import { FOREIGN_PER_DAY, FOREIGN_PER_MEAL, pickDishes, type SuggestRecipe } from "../services/kho-suggest";

// Vietnamese dishes for every role, plus foreign dishes (cuisine western / asian) that win on Kho score: their
// ingredient ("Phô mai") is the only thing in Kho.
const vn = (id: string, role: string, mealTypes: string[]) => ({ id, name: id, role, mealTypes, ingredients: [`${id}-x`], calories: 200, cuisine: "vietnam" });
const foreign = (id: string, role: string, mealTypes: string[], cuisine = "western") => ({ id, name: id, role, mealTypes, ingredients: ["Phô mai"], calories: 200, cuisine });
const LD = ["lunch", "dinner"];
const catalog = [
  ...["pho", "xoi", "chao", "banhmi"].map((id) => vn(id, "sang", ["breakfast"])), vn("sua", "do_uong", ["breakfast"]), vn("cam", "do_uong", ["breakfast"]),
  ...["thitkho", "cakho", "gakho", "tomrim"].map((id) => vn(id, "man", LD)), ...["canhchua", "canhbi", "canhrau"].map((id) => vn(id, "canh", LD)),
  ...["raumuong", "bapcai", "susu"].map((id) => vn(id, "rau", LD)), ...["boxao", "mucxao", "caithia"].map((id) => vn(id, "xao", LD)),
  ...["chuoi", "duahau", "suachua"].map((id) => vn(id, "trang_mieng", LD)),
  foreign("sandwich", "sang", ["breakfast"]), foreign("kimbap", "sang", ["breakfast"], "asian"),
  foreign("steak", "man", LD), foreign("salmon", "man", LD), foreign("gaHan", "man", LD, "asian"),
  foreign("supbi", "canh", LD), foreign("supnam", "canh", LD), foreign("salad", "rau", LD), foreign("khoainghien", "rau", LD),
];
const isForeignId = (id: string | null) => catalog.some((recipe) => recipe.id === id && recipe.cuisine !== "vietnam");
const kho = [{ name: "Phô mai", quantity: 1, unit: "KILOGRAM" }];

type Created = { recipeId: string; mealType: MealType; dayOfWeek: number; details: { role: string } };
function createClient() {
  const created: Array<{ data: { items: { create: Created[] } } }> = [];
  const menu = { findMany: async () => [], deleteMany: async () => ({ count: 0 }), create: async (args: (typeof created)[number]) => { created.push(args); return args; } };
  return { created, client: { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient };
}

test("generation: foreign dishes appear when they score best, but at most 1 per meal and 2 per day (every day of a week)", async () => {
  const { created, client } = createClient();
  await generateMenu({
    userId: "u1", periodType: PeriodType.WEEK, startDate: new Date("2026-11-30T00:00:00Z"), endDate: new Date("2026-12-06T00:00:00Z"),
    recipes: catalog, inventoryItems: kho,
  }, client);
  const items = created[0].data.items.create;
  const days = new Set(items.map((item) => item.dayOfWeek));
  assert.equal(days.size, 7);
  let foreignTotal = 0;
  for (const day of days) {
    const dayItems = items.filter((item) => item.dayOfWeek === day);
    const foreignItems = dayItems.filter((item) => isForeignId(item.recipeId));
    assert.ok(foreignItems.length <= FOREIGN_PER_DAY, `day ${day}: ${foreignItems.length}`);
    for (const meal of [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]) {
      assert.ok(foreignItems.filter((item) => item.mealType === meal).length <= FOREIGN_PER_MEAL, `day ${day} ${meal}`);
    }
    // Meals are still complete (the caps never leave a slot empty while Vietnamese dishes fit).
    for (const meal of [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]) assert.ok(dayItems.some((item) => item.mealType === meal), `day ${day} ${meal}`);
    foreignTotal += foreignItems.length;
  }
  // They score best, so every day uses its whole allowance.
  assert.equal(foreignTotal, 7 * FOREIGN_PER_DAY);
});

type Item = { id: string; recipeId: string | null; dishName: string; mealType: MealType; dayOfWeek: number; details: unknown };
function removeClient(items: Item[]) {
  const writes: string[] = [];
  const client = {
    menu: { findFirst: async () => ({ id: "m1", userId: "u1", familyId: null, periodType: PeriodType.DAY, startDate: new Date("2026-11-30T00:00:00Z"), endDate: new Date("2026-11-30T00:00:00Z"), items: [...items] }) },
    removedDish: { create: async ({ data }: { data: unknown }) => data, findMany: async () => [] },
    menuItem: {
      delete: () => Promise.resolve({}),
      create: ({ data }: { data: Item }) => { writes.push(data.recipeId ?? data.dishName); return Promise.resolve({}); },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;
  return { client, writes };
}
const item = (id: string, recipeId: string, mealType: MealType, role: string): Item => ({ id, recipeId, dishName: recipeId, mealType, dayOfWeek: 1, details: { role } });
const now = new Date("2026-11-30T01:00:00Z");

test("swap: a day that already has 2 foreign dishes gets a Vietnamese replacement; removing a foreign dish frees its place", async () => {
  const day = [item("b1", "pho", MealType.BREAKFAST, "sang"), item("l1", "steak", MealType.LUNCH, "man"), item("l2", "canhchua", MealType.LUNCH, "canh"),
    item("d1", "supbi", MealType.DINNER, "canh"), item("d2", "thitkho", MealType.DINNER, "man")];
  const full = removeClient(day);
  await removeMenuItem({ userId: "u1", menuId: "m1", itemId: "d2", now, recipes: catalog, inventoryItems: kho }, full.client);
  assert.equal(full.writes.length, 1);
  assert.equal(isForeignId(full.writes[0]), false, full.writes[0]);

  const freed = removeClient(day);
  await removeMenuItem({ userId: "u1", menuId: "m1", itemId: "l1", now, recipes: catalog, inventoryItems: kho }, freed.client);
  assert.equal(isForeignId(freed.writes[0]), true, freed.writes[0]);
});

test("pickers keep the per-meal cap even without a shared day counter", () => {
  const recipes: SuggestRecipe[] = catalog.map((recipe) => ({ ...recipe, imageUrl: null, tags: [], ingredients: recipe.ingredients.map((name) => ({ name, quantity: null, unit: null })) }));
  const khoItems = kho.map((entry) => ({ ...entry, expiryDate: null }));
  const oneEach = pickDishes(recipes, khoItems, ["BREAKFAST", "LUNCH", "DINNER"], { today: "2026-11-30", day: "2026-11-30", recentRecipeIds: new Set() });
  assert.equal(oneEach.filter((pick) => isForeignId(pick.suggestion?.recipe.id ?? null)).length, FOREIGN_PER_DAY);
});
