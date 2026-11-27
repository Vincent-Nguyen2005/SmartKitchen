/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { pagerModel, pageWindow } from "./pager";

const enabled = (model: ReturnType<typeof pagerModel>) => model && [...model.before, ...model.after].map((step) => `${step.label}:${step.enabled ? step.target : "off"}`);

test("pager: « ‹ up to 3 numbers around the current › », current highlighted", () => {
  assert.deepEqual(pageWindow(7, 20), [6, 7, 8]);
  assert.deepEqual(pageWindow(1, 20), [1, 2, 3]);
  assert.deepEqual(pageWindow(20, 20), [18, 19, 20]);
  assert.deepEqual(pageWindow(2, 2), [1, 2]);
  const middle = pagerModel(5, 9);
  assert.deepEqual(middle?.pages, [{ number: 4, current: false }, { number: 5, current: true }, { number: 6, current: false }]);
  assert.deepEqual(enabled(middle), ["Trang đầu:1", "Trang trước:4", "Trang sau:6", "Trang cuối:9"]);
});

test("pager: ends dimmed on the first / last page; everything off while loading; hidden for one page", () => {
  assert.deepEqual(enabled(pagerModel(1, 4)), ["Trang đầu:off", "Trang trước:off", "Trang sau:2", "Trang cuối:4"]);
  assert.deepEqual(enabled(pagerModel(4, 4)), ["Trang đầu:1", "Trang trước:3", "Trang sau:off", "Trang cuối:off"]);
  assert.deepEqual(enabled(pagerModel(2, 4, true)), ["Trang đầu:off", "Trang trước:off", "Trang sau:off", "Trang cuối:off"]);
  assert.equal(pagerModel(1, 1), null);
});
