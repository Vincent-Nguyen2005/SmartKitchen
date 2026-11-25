/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { captureBarVisible } from "./captureBar";

const base = { isAdmin: false, profileOpen: false, paymentOpen: false };

test("the capture bar shows on Kho, Đi chợ, Lịch, Nấu ăn, Dinh dưỡng and Gia đình", () => {
  for (const tab of ["inventory", "shopping", "menu", "recipes", "nutrition", "family"]) assert.equal(captureBarVisible({ ...base, tab }), true, tab);
});

test("hidden on Thông báo and Quản trị", () => {
  assert.equal(captureBarVisible({ ...base, tab: "notifications" }), false);
  assert.equal(captureBarVisible({ ...base, tab: "admin" }), false);
});

test("hidden with Hồ sơ (or one of its screens) open, a payment page, or an admin account", () => {
  for (const tab of ["inventory", "family"]) assert.equal(captureBarVisible({ ...base, tab, profileOpen: true }), false, tab);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", paymentOpen: true }), false);
  assert.equal(captureBarVisible({ ...base, tab: "inventory", isAdmin: true }), false);
});
