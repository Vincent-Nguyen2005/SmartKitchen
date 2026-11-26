/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { bulkAddQuantity, NO_SELECTION, selectionReducer, tapIntent, type Selection } from "./selection";

const run = (actions: Parameters<typeof selectionReducer>[1][], start: Selection = NO_SELECTION) => actions.reduce(selectionReducer, start);

test("long press starts selection mode with that card selected; taps then toggle (no sheet)", () => {
  assert.equal(tapIntent(NO_SELECTION), "open");
  const started = run([{ type: "longPress", id: "a" }]);
  assert.deepEqual(started, { active: true, ids: ["a"] });
  assert.equal(tapIntent(started), "toggle");
  assert.deepEqual(run([{ type: "tap", id: "b" }, { type: "tap", id: "c" }, { type: "tap", id: "b" }], started), { active: true, ids: ["a", "c"] });
});

test("a tap outside selection mode changes nothing; unselecting the last card keeps the mode", () => {
  assert.equal(run([{ type: "tap", id: "a" }]), NO_SELECTION);
  assert.deepEqual(run([{ type: "longPress", id: "a" }, { type: "tap", id: "a" }]), { active: true, ids: [] });
});

test("a long press while selecting adds the card and never unselects it", () => {
  assert.deepEqual(run([{ type: "longPress", id: "a" }, { type: "longPress", id: "b" }, { type: "longPress", id: "a" }]), { active: true, ids: ["a", "b"] });
});

test("exit (✕, Android back, empty space, leaving the tab, after adding) clears everything", () => {
  assert.equal(run([{ type: "longPress", id: "a" }, { type: "tap", id: "b" }, { type: "exit" }]), NO_SELECTION);
  assert.equal(selectionReducer(NO_SELECTION, { type: "exit" }), NO_SELECTION);
});

test("default quantity per selected product: 0,5 kg for kg products, 1 otherwise", () => {
  assert.equal(bulkAddQuantity("KILOGRAM"), 0.5);
  for (const unit of ["PIECE", "PACK", "BOTTLE", "CAN", "BOX"] as const) assert.equal(bulkAddQuantity(unit), 1);
});
