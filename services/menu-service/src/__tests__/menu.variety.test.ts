import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, type PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateDays, removeMenuItem } from "../services/menu.service";

type Item = { id: string; recipeId: string | null; dishName: string; mealType: MealType; dayOfWeek: number; details: unknown };
type MenuRow = { id: string; userId: string; familyId: string | null; periodType: PeriodType; startDate: Date; endDate: Date; items: Item[] };
type DateFilter = { lt?: Date; lte?: Date; gte?: Date; in?: Date[] };

const inRange = (value: Date, filter?: DateFilter) => !filter
  || ((filter.lt === undefined || value < filter.lt) && (filter.lte === undefined || value <= filter.lte)
    && (filter.gte === undefined || value >= filter.gte) && (filter.in === undefined || filter.in.some((date) => date.getTime() === value.getTime())));

/** In-memory menus: enough of Prisma for generateMenu / generateDays / removeMenuItem. */
function memoryClient(initial: MenuRow[] = []) {
  const menus: MenuRow[] = [...initial];
  let next = 1;
  const menu = {
    findMany: async ({ where }: { where: { userId?: string; familyId?: string; periodType?: PeriodType; startDate?: DateFilter; endDate?: DateFilter } }) =>
      menus.filter((row) => (where.userId === undefined || row.userId === where.userId) && (where.familyId === undefined || row.familyId === where.familyId)
        && (where.periodType === undefined || row.periodType === where.periodType) && inRange(row.startDate, where.startDate) && inRange(row.endDate, where.endDate)),
    findFirst: async ({ where }: { where: { id: string } }) => menus.find((row) => row.id === where.id) ?? null,
    deleteMany: async ({ where }: { where: { userId: string; periodType: PeriodType; startDate: Date } }) => {
      const before = menus.length;
      for (let index = menus.length - 1; index >= 0; index -= 1) {
        const row = menus[index];
        if (row.userId === where.userId && row.periodType === where.periodType && row.startDate.getTime() === where.startDate.getTime()) menus.splice(index, 1);
      }
      return { count: before - menus.length };
    },
    create: async ({ data }: { data: Omit<MenuRow, "id" | "items"> & { items: { create: Array<Omit<Item, "id">> } } }) => {
      const id = `m${next++}`;
      const row: MenuRow = { ...data, id, items: data.items.create.map((entry, index) => ({ ...entry, id: `${id}-${index}` })) };
      menus.push(row);
      return row;
    },
  };
  const client = {
    menu,
    menuItem: {
      delete: ({ where }: { where: { id: string } }) => { for (const row of menus) row.items = row.items.filter((entry) => entry.id !== where.id); return Promise.resolve({}); },
      create: ({ data }: { data: Item & { menuId: string } }) => { menus.find((row) => row.id === data.menuId)?.items.push({ ...data, id: `new-${next++}` }); return Promise.resolve({}); },
    },
    removedDish: { create: async () => ({}), findMany: async () => [] },
    $transaction: async (input: unknown) => (typeof input === "function" ? (input as (tx: unknown) => Promise<unknown>)({ menu }) : Promise.all(input as Array<Promise<unknown>>)),
  } as unknown as PrismaClient;
  return { client, menus };
}

const r = (id: string, role: string, mealTypes: string[], ingredients: string[] = [`${id}-x`]) => ({ id, name: id, role, mealTypes, ingredients, calories: 200 });
// Eggs are in Kho, so "banhmitrung" and "thitkho" always have the best Kho score.
const catalog = [
  r("banhmitrung", "sang", ["breakfast"], ["Trứng gà"]), r("xoi", "sang", ["breakfast"]), r("chao", "sang", ["breakfast"]), r("pho", "mot_mon", ["breakfast"]), r("banhcuon", "sang", ["breakfast"]),
  r("thitkho", "man", ["lunch", "dinner"], ["Trứng gà"]), r("cakho", "man", ["lunch", "dinner"]), r("gakho", "man", ["lunch", "dinner"]), r("tomrim", "man", ["lunch", "dinner"]), r("suon", "man", ["lunch", "dinner"]), r("dauphu", "man", ["lunch", "dinner"]),
];
const kho = [{ name: "Trứng gà", quantity: 30, unit: "PIECE" }];
const week = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"];
const now = new Date("2026-11-24T03:00:00Z");

/** The first dish of each meal per day (the main / breakfast dish), in day order. */
function plannedByMeal(menus: MenuRow[]) {
  const byMeal = new Map<MealType, string[]>();
  for (const row of [...menus].sort((left, right) => left.startDate.getTime() - right.startDate.getTime())) {
    for (const meal of [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]) {
      const first = row.items.find((entry) => entry.mealType === meal);
      if (first) byMeal.set(meal, [...(byMeal.get(meal) ?? []), first.recipeId ?? ""]);
    }
  }
  return byMeal;
}

test("7-day generation with a small catalog: rules relax gracefully — no main on consecutive days, repeats spread evenly", async () => {
  const { client, menus } = memoryClient();
  await generateDays({ userId: "u1", familyId: "f1", days: week, now, recipes: catalog, inventoryItems: kho }, client);
  assert.equal(menus.length, 7);
  const sorted = [...menus].sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
  // Only 6 món mặn and no canh / rau / xào: each day needs 4 of them (2 mains + 2 sides), so the 7-day window and even
  // "not the next day" cannot hold for every dish. What still holds: no dish twice in a day, and the main of a meal is
  // not yesterday's main of that meal.
  for (const row of sorted) assert.equal(new Set(row.items.map((entry) => entry.recipeId)).size, row.items.length);
  for (const [meal, ids] of plannedByMeal(menus)) {
    for (let index = 1; index < ids.length; index += 1) assert.notEqual(ids[index], ids[index - 1], `${meal} day ${index}: ${ids.join()}`);
  }
  const uses = new Map<string, number>();
  for (const row of sorted) for (const entry of row.items) uses.set(entry.recipeId ?? "", (uses.get(entry.recipeId ?? "") ?? 0) + 1);
  const mains = ["thitkho", "cakho", "gakho", "tomrim", "suon", "dauphu"].map((id) => uses.get(id) ?? 0);
  // Spread: every món mặn is used, none much more than the others.
  assert.ok(mains.every((count) => count >= 1), mains.join());
  assert.ok(Math.max(...mains) - Math.min(...mains) <= 2, mains.join());
  // The Kho favourite is still used, just not every day.
  assert.ok(plannedByMeal(menus).get(MealType.BREAKFAST)?.includes("banhmitrung"));
});

test("a day generated between saved days avoids the dishes of the day before AND the day after", async () => {
  const saved = (id: string, day: string, recipeId: string): MenuRow => ({
    id, userId: "u1", familyId: "f1", periodType: PeriodType.DAY, startDate: new Date(`${day}T00:00:00Z`), endDate: new Date(`${day}T00:00:00Z`),
    items: [{ id: `${id}-b`, recipeId, dishName: recipeId, mealType: MealType.BREAKFAST, dayOfWeek: new Date(`${day}T00:00:00Z`).getUTCDay() || 7, details: { role: "sang" } }],
  });
  const { client, menus } = memoryClient([saved("d1", "2026-11-24", "xoi"), saved("d3", "2026-11-26", "banhmitrung")]);
  await generateDays({ userId: "u1", familyId: "f1", days: ["2026-11-25"], now, recipes: catalog, inventoryItems: kho }, client);
  const created = menus.find((row) => row.startDate.toISOString().startsWith("2026-11-25"));
  const breakfast = created?.items.find((entry) => entry.mealType === MealType.BREAKFAST)?.recipeId;
  assert.ok(breakfast && !["xoi", "banhmitrung"].includes(breakfast), String(breakfast));
});

test("swap respects variety: the replacement is not the dish planned in that meal the day before or after", async () => {
  const day = (id: string, date: string, items: Item[]): MenuRow => ({ id, userId: "u1", familyId: "f1", periodType: PeriodType.DAY, startDate: new Date(`${date}T00:00:00Z`), endDate: new Date(`${date}T00:00:00Z`), items });
  const lunch = (id: string, recipeId: string, dayOfWeek: number): Item => ({ id, recipeId, dishName: recipeId, mealType: MealType.LUNCH, dayOfWeek, details: { role: "man" } });
  const { client, menus } = memoryClient([
    day("prev", "2026-11-24", [lunch("p1", "thitkho", 2)]),
    day("cur", "2026-11-25", [lunch("c1", "cakho", 3)]),
    day("next", "2026-11-26", [lunch("n1", "gakho", 4)]),
  ]);
  await removeMenuItem({ userId: "u1", menuId: "cur", itemId: "c1", now, recipes: catalog, inventoryItems: kho }, client);
  const replacement = menus.find((row) => row.id === "cur")?.items[0]?.recipeId;
  // thitkho has the best Kho score but is on the previous day; gakho is on the next day.
  assert.ok(replacement && !["thitkho", "gakho", "cakho"].includes(replacement), String(replacement));
});
