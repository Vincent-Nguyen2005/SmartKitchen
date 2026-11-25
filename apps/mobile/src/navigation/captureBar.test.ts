/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { captureBarVisible } from "./captureBar";

const base = { isAdmin: false, profileOpen: false, paymentOpen: false };

test("the capture bar shows on every member tab, Thông báo and Gia đình included", () => {
  for (const tab of ["inventory", "shopping", "menu", "recipes", "nutrition", "family", "notifications"]) assert.equal(captureBarVisible({ ...base, tab }), true, tab);
  assert.equal(captureBarVisible({ ...base, tab: "admin" }), false);
});

test("hidden only with Hồ sơ (or one of its screens) open, a payment page, or an admin account", () => {
  for (const tab of ["inventory", "notifications", "family"]) assert.equal(captureBarVisible({ ...base, tab, profileOpen: true }), false, tab);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", paymentOpen: true }), false);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", isAdmin: true }), false);
});
