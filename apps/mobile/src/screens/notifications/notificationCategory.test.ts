/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { notificationCategory, opensOrders } from "./notificationCategory";

test("order notices show as Đơn hàng with a truck and open Đơn hàng", () => {
  const order = { type: "SYSTEM" as const, data: { type: "order", orderId: "o1", status: "SHIPPING" } };
  assert.deepEqual(notificationCategory(order), { label: "Đơn hàng", icon: "truck" });
  assert.equal(opensOrders(order), true);
});

test("other notices keep their category", () => {
  assert.deepEqual(notificationCategory({ type: "SYSTEM", data: { type: "report" } }), { label: "Hệ thống", icon: "info" });
  assert.deepEqual(notificationCategory({ type: "PROMOTION", data: null }), { label: "Khuyến mãi", icon: "tag" });
  assert.deepEqual(notificationCategory({ type: "EXPIRY_ALERT" }), { label: "Sắp hết hạn", icon: "clock" });
  assert.equal(opensOrders({ type: "SYSTEM", data: null }), false);
});
