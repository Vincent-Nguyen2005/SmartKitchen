import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { recipeUsageHandler, requireInternalKey } from "../routes/internal.route";

const KEY = "k".repeat(40);
const responseMock = () => {
  const calls: { status?: number; body?: unknown } = {};
  const res = { status(code: number) { calls.status = code; return res; }, json(body: unknown) { calls.body = body; return res; } };
  return { res, calls };
};
const req = (key: string | undefined, recipeId = "r1") => ({ get: () => key, params: { recipeId } }) as unknown as Request;

test("internal recipe usage needs the internal key", () => {
  const previous = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = KEY;
  try {
    const denied = responseMock(); let passed = 0;
    requireInternalKey(req("wrong"), denied.res as never, () => { passed += 1; });
    assert.equal(denied.calls.status, 403);
    requireInternalKey(req(KEY), responseMock().res as never, () => { passed += 1; });
    assert.equal(passed, 1);
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = previous;
  }
});

test("counts menu items and dislike history pointing at the recipe", async () => {
  const where: unknown[] = [];
  const client = {
    menuItem: { count: async (args: { where: unknown }) => { where.push(args.where); return 3; } },
    removedDish: { count: async (args: { where: unknown }) => { where.push(args.where); return 1; } },
  };
  const { res, calls } = responseMock();
  await recipeUsageHandler(client as never)(req(KEY, "r1"), res as never, () => undefined);
  assert.deepEqual(calls.body, { menuItems: 3, removedDishes: 1 });
  assert.deepEqual(where, [{ recipeId: "r1" }, { recipeId: "r1" }]);
});

test("breakfast today: the family's breakfast dish names for the Vietnam day, day menu first, Lịch order", async () => {
  const { breakfastDishes, breakfastToday } = await import("../services/breakfast-today");
  const day = "2026-11-26"; // Thursday
  const dayMenu = { familyId: "f1", periodType: "DAY", startDate: new Date(`${day}T00:00:00Z`), items: [
    { dishName: "Sữa đậu nành", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "do_uong" } },
    { dishName: "Bún riêu cua", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "mot_mon" } },
    { dishName: "Bánh mì trứng ốp la", mealType: "BREAKFAST", dayOfWeek: 4, details: { role: "sang" } },
    { dishName: "Canh chua cá", mealType: "LUNCH", dayOfWeek: 4, details: { role: "canh" } },
  ] };
  const weekMenu = { familyId: "f1", periodType: "WEEK", startDate: new Date("2026-11-23T00:00:00Z"), items: [
    { dishName: "Phở bò", mealType: "BREAKFAST", dayOfWeek: 4, details: null },
    { dishName: "Xôi", mealType: "BREAKFAST", dayOfWeek: 5, details: null },
  ] };
  assert.deepEqual(breakfastDishes([weekMenu, dayMenu], day), ["Bánh mì trứng ốp la", "Bún riêu cua", "Sữa đậu nành"]);
  assert.deepEqual(breakfastDishes([weekMenu], day), ["Phở bò"]); // covering week menu: Thursday's items only
  assert.deepEqual(breakfastDishes([], day), []);

  const where: unknown[] = [];
  const client = { menu: { findMany: async (args: { where: unknown }) => { where.push(args.where); return [dayMenu]; } } };
  const lookup = async () => [{ userId: "u1", familyId: "f1", role: "OWNER" as const, memberCount: 2 }, { userId: "u2", familyId: "f2", role: "MEMBER" as const, memberCount: 1 }];
  const result = await breakfastToday(["u1", "u2", "u3"], client as never, { lookup, now: new Date("2026-11-26T00:30:00Z") }); // 07:30 in Vietnam
  assert.equal(result.day, day);
  // u3 has no family (left out); u2's family has no menu today (empty list).
  assert.deepEqual(result.items, [{ userId: "u1", dishes: ["Bánh mì trứng ốp la", "Bún riêu cua", "Sữa đậu nành"] }, { userId: "u2", dishes: [] }]);
  assert.deepEqual((where[0] as { familyId: unknown }).familyId, { in: ["f1", "f2"] });
});

test("breakfast today handler: validates the body and answers 503 when family-service is down", async () => {
  const { breakfastTodayHandler } = await import("../routes/internal.route");
  const { FamilyLookupError } = await import("../services/family-client");
  const run = async (body: unknown, lookup: () => Promise<never[]>) => {
    const { res, calls } = responseMock();
    await breakfastTodayHandler({ menu: { findMany: async () => [] } } as never, lookup)({ body } as never, res as never, () => undefined);
    return calls;
  };
  assert.equal((await run({}, async () => [])).status, 400);
  assert.equal((await run({ userIds: [] }, async () => [])).status, 400);
  assert.equal((await run({ userIds: ["u1"] }, async () => { throw new FamilyLookupError("down"); })).status, 503);
  assert.deepEqual(((await run({ userIds: ["u1"] }, async () => [])).body as { items: unknown[] }).items, []);
});

test("week product usage: households per ingredient this week, anonymous, seasonings left out", async () => {
  const { countWeekUsage, vnWeek, weekProductUsage } = await import("../services/week-product-usage");
  assert.deepEqual(vnWeek(new Date("2026-11-29T16:30:00.000Z")), { from: "2026-11-23", to: "2026-11-29" }); // Sun 23:30 VN
  assert.deepEqual(vnWeek(new Date("2026-11-29T17:30:00.000Z")), { from: "2026-11-30", to: "2026-12-06" }); // Mon 00:30 VN
  const recipes = [
    { id: "r1", details: [{ name: "Thịt heo", quantity: 300, unit: "g" }, { name: "Nước mắm", quantity: 2, unit: "muỗng", isSeasoning: true }] },
    { id: "r2", details: [{ name: "thịt heo", quantity: 200, unit: "g" }, { name: "Cà chua", quantity: 2, unit: "quả" }] },
  ];
  const menus = [
    { familyId: "f1", userId: "u1", items: [{ recipeId: "r1", details: null }, { recipeId: "r2", details: null }] },
    { familyId: "f1", userId: "u2", items: [{ recipeId: "r2", details: null }] },
    { familyId: null, userId: "u3", items: [{ recipeId: null, details: { availableIngredients: ["Trứng gà"], missingIngredients: [{ name: "Cà chua" }] } }] },
  ];
  // Thịt heo: family f1 only (two dishes, two menus) = 1; Cà chua: f1 and u3's personal menu = 2; no Nước mắm.
  assert.deepEqual(countWeekUsage(menus, recipes as never), [{ name: "cà chua", households: 2 }, { name: "thịt heo", households: 1 }, { name: "trứng gà", households: 1 }]);
  let where: unknown = null;
  const client = { menu: { findMany: async (args: { where: unknown }) => { where = args.where; return menus; } } };
  const result = await weekProductUsage(client as never, { now: new Date("2026-11-27T03:00:00.000Z"), recipes: [] });
  assert.deepEqual(result.week, { from: "2026-11-23", to: "2026-11-29" });
  assert.deepEqual(where, { archived: false, startDate: { lte: new Date("2026-11-29T00:00:00.000Z") }, endDate: { gte: new Date("2026-11-23T00:00:00.000Z") } });
  // Only names and counts leave the service.
  assert.ok(result.items.every((item) => Object.keys(item).sort().join() === "households,name"));
});
