/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createSelectionBarStore, IDLE_BAR, selectedCountText } from "./selectionBar";
import { sameCardProps } from "./marketCard";
import { NO_SELECTION, selectionReducer } from "./selection";

test("the bar store: Đi chợ publishes the selection, App reads it; ✕ and add call Đi chợ's handlers", () => {
  const store = createSelectionBarStore();
  let notified = 0;
  let exits = 0;
  let adds = 0;
  store.subscribe(() => { notified += 1; });
  assert.equal(store.get(), IDLE_BAR);
  store.publish({ active: true, count: 2, busy: false, canAdd: true }, { onExit: () => { exits += 1; }, onAdd: () => { adds += 1; } });
  assert.deepEqual(store.get(), { active: true, count: 2, busy: false, canAdd: true });
  store.exit();
  store.add();
  assert.deepEqual([exits, adds], [1, 1]);
  // The same state again does not notify (no extra App renders).
  store.publish({ active: true, count: 2, busy: false, canAdd: true }, { onExit: () => undefined, onAdd: () => undefined });
  assert.equal(notified, 1);
  store.clear();
  assert.equal(store.get(), IDLE_BAR);
  assert.equal(notified, 2);
});

test("'Thêm vào giỏ' does nothing while disabled (N = 0 or no family)", () => {
  const store = createSelectionBarStore();
  let adds = 0;
  store.publish({ active: true, count: 0, busy: false, canAdd: false }, { onExit: () => undefined, onAdd: () => { adds += 1; } });
  store.add();
  assert.equal(adds, 0);
  assert.equal(selectedCountText(0), "0 đã chọn");
  assert.equal(selectedCountText(12), "12 đã chọn");
});

test("a toggle re-renders only the card whose selected state changed", () => {
  const onPress = () => undefined;
  const onLongPress = () => undefined;
  const products = Array.from({ length: 139 }, (_, index) => ({ id: `p${index}` }));
  const propsFor = (selected: Set<string>) => products.map((product) => ({ product, width: 120, selected: selected.has(product.id), onPress, onLongPress }));
  let state = selectionReducer(NO_SELECTION, { type: "longPress", id: "p3" });
  const before = propsFor(new Set(state.ids));
  state = selectionReducer(state, { type: "tap", id: "p7" });
  const after = propsFor(new Set(state.ids));
  const rerendered = after.filter((props, index) => !sameCardProps(before[index], props)).map((props) => (props.product as { id: string }).id);
  assert.deepEqual(rerendered, ["p7"]);
  // Entering or leaving selection mode changes every card's check box (expected, once per mode change).
  assert.equal(sameCardProps({ ...before[0], selected: undefined }, before[0]), false);
});
