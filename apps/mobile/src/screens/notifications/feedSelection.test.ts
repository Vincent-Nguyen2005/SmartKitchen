/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { NO_SELECTION, selectionReducer, tapIntent } from "../shopping-cart/selection";
import {
  deleteConfirmTitle,
  dismissKey,
  expiryDismissKey,
  expiryText,
  orderTarget,
  splitSelection,
  visibleExpiryAlerts,
  vietnamWeekStart,
  weekDismissKey,
  withoutDismissed,
  type ExpiryAlertLike,
  type SelectableEntry,
} from "./feedSelection";

const alert = (overrides: Partial<ExpiryAlertLike> = {}): ExpiryAlertLike => ({
  id: "item-1", name: "Sữa tươi", quantity: 1, expiryDate: "2026-11-29T00:00:00.000Z", status: "NEAR_EXPIRY", daysLeft: 2, deliveryOrderId: null, ...overrides,
});

test("selection: long press starts with that card, taps toggle, exit clears (feed keys)", () => {
  let state = selectionReducer(NO_SELECTION, { type: "longPress", id: "n1" });
  assert.deepEqual(state, { active: true, ids: ["n1"] });
  assert.equal(tapIntent(state), "toggle");
  state = selectionReducer(state, { type: "tap", id: "expiry-item-1" });
  state = selectionReducer(state, { type: "tap", id: "week-missing" });
  state = selectionReducer(state, { type: "tap", id: "n1" });
  assert.deepEqual(state.ids, ["expiry-item-1", "week-missing"]);
  // Unselecting everything keeps the mode ("0 đã chọn", Xóa disabled); ✕ / back / empty space / tab change exit.
  state = selectionReducer(selectionReducer(state, { type: "tap", id: "expiry-item-1" }), { type: "tap", id: "week-missing" });
  assert.deepEqual(state, { active: true, ids: [] });
  assert.equal(selectionReducer(state, { type: "exit" }), NO_SELECTION);
  assert.equal(tapIntent(NO_SELECTION), "open");
});

test("split: stored rows are deleted by id, computed items are dismissed by state key", () => {
  const entries: SelectableEntry[] = [
    { kind: "week", key: "week-missing", weekStart: "2026-11-23" },
    { kind: "expiry", key: "expiry-item-1", item: alert() },
    { kind: "notification", key: "n1", item: { id: "n1" } },
    { kind: "notification", key: "n2", item: { id: "n2" } },
    { kind: "promotion", key: "promotion-p1", item: { id: "p1" } },
  ];
  assert.deepEqual(splitSelection(["n1", "week-missing", "expiry-item-1", "promotion-p1", "gone"], entries), {
    notificationIds: ["n1"],
    dismissKeys: ["week:2026-11-23", "expiry:item-1:2026-11-29:2-ngay", "promotion:p1"],
  });
  assert.equal(deleteConfirmTitle(3), "Xóa 3 thông báo?");
});

test("dismissal keys carry the state: a dismissed item comes back when the state changes", () => {
  const dismissed = new Set([expiryDismissKey(alert({ daysLeft: 2 })), weekDismissKey("2026-11-23")]);
  const feed = (daysLeft: number, expiryDate: string, weekStart: string): SelectableEntry[] => [
    { kind: "expiry", key: "expiry-item-1", item: alert({ daysLeft, expiryDate }) },
    { kind: "week", key: "week-missing", weekStart },
  ];
  // Same state: hidden.
  assert.deepEqual(withoutDismissed(feed(2, "2026-11-29T00:00:00.000Z", "2026-11-23"), dismissed), []);
  // Next stage (1 ngày), a new expiry date, or a new week: back.
  assert.deepEqual(withoutDismissed(feed(1, "2026-11-29T00:00:00.000Z", "2026-11-23"), dismissed).map((entry) => entry.kind), ["expiry"]);
  assert.deepEqual(withoutDismissed(feed(2, "2026-12-01T00:00:00.000Z", "2026-11-23"), dismissed).map((entry) => entry.kind), ["expiry"]);
  assert.deepEqual(withoutDismissed(feed(2, "2026-11-29T00:00:00.000Z", "2026-11-30"), dismissed).map((entry) => entry.kind), ["week"]);
  // Stages: "sau N ngày", hôm nay and the grace period are each their own; every grace day is the same stage (no
  // daily comeback while "đã hết hạn N ngày" counts up).
  assert.equal(expiryDismissKey(alert({ daysLeft: 2 })), "expiry:item-1:2026-11-29:2-ngay");
  assert.equal(expiryDismissKey(alert({ daysLeft: 0 })), "expiry:item-1:2026-11-29:hom-nay");
  assert.equal(expiryDismissKey(alert({ daysLeft: -1 })), "expiry:item-1:2026-11-29:het-han");
  assert.equal(expiryDismissKey(alert({ daysLeft: -1 })), expiryDismissKey(alert({ daysLeft: -3 })));
  // Stored rows never have a dismissal key.
  assert.equal(dismissKey({ kind: "notification", key: "n1", item: { id: "n1" } }), null);
});

test("week start is Monday in Vietnam (Sunday 23:30 VN is still the old week, Monday 00:30 VN the new one)", () => {
  assert.equal(vietnamWeekStart(new Date("2026-11-29T16:30:00.000Z")), "2026-11-23"); // Sun 29/11 23:30 VN
  assert.equal(vietnamWeekStart(new Date("2026-11-29T17:30:00.000Z")), "2026-11-30"); // Mon 30/11 00:30 VN
  assert.equal(vietnamWeekStart(new Date("2026-11-27T03:00:00.000Z")), "2026-11-23"); // Fri
});

test("expiry wording: future with the date, today, past in days", () => {
  assert.equal(expiryText(alert({ daysLeft: 2 })), "Sữa tươi hết hạn sau 2 ngày (29/11)");
  assert.equal(expiryText(alert({ daysLeft: 1, expiryDate: "2026-11-28T00:00:00.000Z" })), "Sữa tươi hết hạn sau 1 ngày (28/11)");
  assert.equal(expiryText(alert({ daysLeft: 0 })), "Sữa tươi hết hạn hôm nay");
  assert.equal(expiryText(alert({ name: "Trứng", daysLeft: -3 })), "Trứng đã hết hạn 3 ngày");
});

test("expiry visibility: consumed (0 left), consumed / discarded status, Đang giao and undated rows never show", () => {
  const items = [
    alert({ id: "ok" }),
    alert({ id: "eaten", quantity: 0 }),
    alert({ id: "consumed", status: "CONSUMED" }),
    alert({ id: "discarded", status: "DISCARDED" }),
    alert({ id: "delivering", deliveryOrderId: "o1" }),
    alert({ id: "undated", expiryDate: null }),
    alert({ id: "expired", status: "EXPIRED", daysLeft: -2 }),
  ];
  // Grace 3 (the server's value): an item expired 2 days ago still alerts.
  assert.deepEqual(visibleExpiryAlerts(items, 3).map((item) => item.id), ["ok", "expired"]);
});

test("expiry alerts per stage follow the server's grace days: 'sau N ngày', 'hôm nay', 'đã hết hạn N ngày' only in the grace days", () => {
  const items = [
    alert({ id: "soon", daysLeft: 2 }),
    alert({ id: "today", daysLeft: 0 }),
    alert({ id: "1-day", daysLeft: -1, status: "EXPIRED" }),
    alert({ id: "3-days", daysLeft: -3, status: "EXPIRED" }),
    alert({ id: "4-days", daysLeft: -4, status: "EXPIRED" }),
  ];
  // Default 0: nothing once expired.
  assert.deepEqual(visibleExpiryAlerts(items).map((item) => item.id), ["soon", "today"]);
  assert.deepEqual(visibleExpiryAlerts(items, 0).map((item) => item.id), ["soon", "today"]);
  assert.deepEqual(visibleExpiryAlerts(items, 3).map((item) => item.id), ["soon", "today", "1-day", "3-days"]);
  assert.equal(expiryText(items[2]), "Sữa tươi đã hết hạn 1 ngày");
});

test("navigation target: order notices open Đi chợ › Đơn hàng on that order; anything else does not", () => {
  assert.deepEqual(orderTarget({ type: "order", orderId: "o1", status: "DELIVERED" }), { orderId: "o1" });
  assert.equal(orderTarget({ type: "order" }), null);
  assert.equal(orderTarget({ promotionId: "p1" }), null);
  assert.equal(orderTarget({ type: "morning", screen: "home" }), null);
  assert.equal(orderTarget(null), null);
});
