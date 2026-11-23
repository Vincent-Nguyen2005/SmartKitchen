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
