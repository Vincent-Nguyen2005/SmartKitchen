/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { pushTarget } from "./pushTarget";

test("a tapped morning push opens today's breakfast, or the home without a menu", () => {
  assert.deepEqual(pushTarget({ type: "morning", screen: "menu", meal: "BREAKFAST", day: "2026-11-26" }), { meal: "BREAKFAST" });
  assert.deepEqual(pushTarget({ type: "morning", screen: "home" }), { meal: null });
  assert.equal(pushTarget({ promotionId: "p1" }), undefined);
  assert.equal(pushTarget(null), undefined);
});
