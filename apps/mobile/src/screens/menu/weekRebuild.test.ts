/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { canRebuildWeek, weekRebuildDays } from "./weekRebuild";

test("Tạo lại tuần: owner (or no family) only; today and later days of the shown week", () => {
  assert.equal(canRebuildWeek({ currentUserRole: "OWNER" }), true);
  assert.equal(canRebuildWeek({ currentUserRole: "MEMBER" }), false);
  assert.equal(canRebuildWeek(null), true);
  // Week of Mon 23/11, today Sat 28/11: Saturday and Sunday.
  assert.deepEqual(weekRebuildDays("2026-11-23", "2026-11-28"), ["2026-11-28", "2026-11-29"]);
  assert.deepEqual(weekRebuildDays("2026-11-30", "2026-11-28").length, 7);
  assert.deepEqual(weekRebuildDays("2026-11-16", "2026-11-28"), []);
});
