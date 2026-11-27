/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_BAR_ACTIONS, overlayFor } from "./adminBar";
import { canCancel, canUnassign, cancelConfirm, orderCardLabel, shortAddress, statusLabel, tabLabel, ADMIN_STATUS_TABS } from "./adminOrders";
import { canGoForward, deliveredText, ordersText, periodTitle, shipperTitle } from "./revenue";
import { isGatewayImage } from "../../services/authImage";

test("bottom bar: Chụp ảnh (create from photo) · Đơn hàng (centre, primary) · Doanh thu; each opens its own overlay", () => {
  assert.deepEqual(ADMIN_BAR_ACTIONS.map((action) => [action.label, action.primary ?? false]), [["Chụp ảnh", false], ["Đơn hàng", true], ["Doanh thu", false]]);
  assert.deepEqual(ADMIN_BAR_ACTIONS.map((action) => overlayFor(action.key)), ["photo", "orders", "revenue"]);
});

test("Đơn hàng: tabs with counts, short address, actions per status, card label", () => {
  assert.deepEqual(ADMIN_STATUS_TABS.map((tab) => tab.label), ["Chờ giao", "Đang giao", "Đã giao", "Đã hủy", "Không giao được"]);
  assert.equal(tabLabel(ADMIN_STATUS_TABS[0], { PENDING: 3 }), "Chờ giao (3)");
  assert.equal(tabLabel(ADMIN_STATUS_TABS[4], null), "Không giao được");
  assert.equal(shortAddress("12 Lê Lợi, Quận 1, TP. Hồ Chí Minh"), "12 Lê Lợi, Quận 1");
  assert.equal(shortAddress(null), "Chưa có địa chỉ");
  assert.deepEqual(["PENDING", "SHIPPING", "DELIVERED"].map((status) => [canCancel(status as never), canUnassign(status as never)]), [[true, false], [false, true], [false, false]]);
  assert.equal(statusLabel("FAILED"), "Không giao được");
  assert.match(cancelConfirm(171_000).message, /171\.000đ/);
  assert.equal(orderCardLabel({ id: "1", status: "PENDING", purchasedAt: "", receiverName: "Lan", deliveryAddress: "12 Lê Lợi, Quận 1, HCM", itemCount: 2, total: 171_000, discountAmount: 0 }, "01/12 · 08:00"), "Chờ giao, 01/12 · 08:00, Lan, 12 Lê Lợi, Quận 1, 2 món, 171.000 đồng");
});

test("Doanh thu (shipper cash): period titles, summary and shipper texts", () => {
  assert.equal(periodTitle({ kind: "today", offset: 0, firstDay: "2026-12-01", lastDay: "2026-12-01" }), "Hôm nay, 01/12");
  assert.equal(periodTitle({ kind: "today", offset: -1, firstDay: "2026-11-30", lastDay: "2026-11-30" }), "Thứ Hai, 30/11");
  assert.equal(periodTitle({ kind: "7d", offset: 0, firstDay: "2026-11-25", lastDay: "2026-12-01" }), "25/11 – 01/12");
  assert.equal(periodTitle({ kind: "month", offset: 0, firstDay: "2026-12-01", lastDay: "2026-12-31" }), "Tháng 12/2026");
  assert.equal(deliveredText(5), "5 đơn đã giao");
  assert.equal(ordersText(2), "2 đơn");
  assert.equal(shipperTitle({ name: null, direct: true }), "Mua trực tiếp");
  assert.equal(shipperTitle({ name: "Anh Tú", direct: false }), "Anh Tú");
  assert.equal(canGoForward(0), false);
  assert.equal(canGoForward(-1), true);
});

test("uploaded catalog images are gateway paths (loaded with the token); pasted https links stay external", () => {
  assert.equal(isGatewayImage("/api/admin/catalog/images/" + "a".repeat(32) + ".jpg"), true);
  assert.equal(isGatewayImage("https://cdn.example.com/ca-chua.jpg"), false);
  assert.equal(isGatewayImage(null), false);
});
