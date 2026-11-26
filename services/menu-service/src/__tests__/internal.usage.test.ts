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
