/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { captureBarVisible } from "./captureBar";

const base = { isAdmin: false, profileOpen: false, paymentOpen: false };

test("the capture bar shows on the food tabs only", () => {
  for (const tab of ["inventory", "shopping", "menu", "recipes"]) assert.equal(captureBarVisible({ ...base, tab }), true, tab);
  for (const tab of ["notifications", "family", "nutrition", "admin"]) assert.equal(captureBarVisible({ ...base, tab }), false, tab);
});

test("never with Hồ sơ (or one of its screens), a payment page, or an admin account", () => {
  assert.equal(captureBarVisible({ ...base, tab: "inventory", profileOpen: true }), false);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", paymentOpen: true }), false);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", isAdmin: true }), false);
});
