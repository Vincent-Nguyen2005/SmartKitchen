/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { HIGHLIGHT_MS, itemsLine, LIVE_REFRESH_MS, mergeLive, orderCardLabel, shouldRefreshNow, sortByLastChange, STATUS_TAGS, statusLabel, type AdminOrderSummary } from "./adminOrders";

const order = (id: string, status: AdminOrderSummary["status"], lastUpdatedAt: string, extra: Partial<AdminOrderSummary> = {}): AdminOrderSummary => ({
  id, status, purchasedAt: "2026-11-20T03:00:00Z", receiverName: "Lan", deliveryAddress: "12 Lê Lợi, Quận 1, TP. HCM", itemCount: 3, total: 171_000, discountAmount: 0, lastUpdatedAt, shipperName: null, ...extra,
});

test("status tag: label and colour per status (grey, orange, green, soft red)", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(STATUS_TAGS).map(([key, tag]) => [key, `${tag.label}/${tag.tone}`])), {
    PENDING: "Chờ giao/neutral", SHIPPING: "Đang giao/warning", DELIVERED: "Đã giao/success", CANCELLED: "Đã hủy/danger", FAILED: "Không giao được/danger",
  });
  assert.equal(statusLabel("FAILED"), "Không giao được");
});

test("items line names the shipper on SHIPPING / DELIVERED only", () => {
  assert.equal(itemsLine({ itemCount: 3, status: "SHIPPING", shipperName: "Anh Tú" }), "3 món · Người giao: Anh Tú");
  assert.equal(itemsLine({ itemCount: 3, status: "DELIVERED", shipperName: "Anh Tú" }), "3 món · Người giao: Anh Tú");
  assert.equal(itemsLine({ itemCount: 3, status: "PENDING", shipperName: "Anh Tú" }), "3 món");
  assert.equal(itemsLine({ itemCount: 2, status: "SHIPPING", shipperName: null }), "2 món");
  assert.match(orderCardLabel(order("a", "PENDING", "2026-11-20T03:00:00Z"), "10:00"), /^Chờ giao, 10:00, Lan/);
});

test("sorted by last status change, newest first (ties: newer purchase, then id)", () => {
  const list = sortByLastChange([
    order("a", "PENDING", "2026-11-20T03:00:00Z"),
    order("b", "DELIVERED", "2026-11-21T09:00:00Z"),
    order("c", "SHIPPING", "2026-11-21T08:00:00Z"),
    order("d", "PENDING", "2026-11-20T03:00:00Z", { purchasedAt: "2026-11-20T04:00:00Z" }),
  ]);
  assert.deepEqual(list.map((entry) => entry.id), ["b", "c", "d", "a"]);
});

test("live refresh: a status change moves the card to the top and is reported; nothing else moves", () => {
  const current = [order("b", "PENDING", "2026-11-21T09:00:00Z"), order("c", "PENDING", "2026-11-21T08:00:00Z"), order("a", "PENDING", "2026-11-20T03:00:00Z")];
  const fresh = [order("a", "SHIPPING", "2026-11-22T10:00:00Z", { shipperName: "Anh Tú" }), order("b", "PENDING", "2026-11-21T09:00:00Z")];
  const merged = mergeLive(current, fresh);
  assert.deepEqual(merged.items.map((entry) => `${entry.id}:${entry.status}`), ["a:SHIPPING", "b:PENDING", "c:PENDING"]);
  assert.deepEqual(merged.changedIds, ["a"]);
  // Nothing changed: same list, nothing to highlight.
  const again = mergeLive(merged.items, merged.items.slice(0, 2));
  assert.deepEqual(again.items.map((entry) => entry.id), ["a", "b", "c"]);
  assert.deepEqual(again.changedIds, []);
  // A new order is added (not a change).
  const added = mergeLive(merged.items, [order("e", "PENDING", "2026-11-23T01:00:00Z")]);
  assert.deepEqual(added.items.map((entry) => entry.id), ["e", "a", "b", "c"]);
  assert.deepEqual(added.changedIds, []);
});

test("live refresh runs every 15 s only while open, in front, no sheet, not typing; highlight under 1 s", () => {
  const now = 100_000;
  const base = { visible: true, appActive: true, sheetOpen: false, lastTypedAt: 0, now };
  assert.equal(LIVE_REFRESH_MS, 15_000);
  assert.equal(shouldRefreshNow(base), true);
  assert.equal(shouldRefreshNow({ ...base, visible: false }), false);
  assert.equal(shouldRefreshNow({ ...base, appActive: false }), false);
  assert.equal(shouldRefreshNow({ ...base, sheetOpen: true }), false);
  assert.equal(shouldRefreshNow({ ...base, lastTypedAt: now - 1_000 }), false);
  assert.equal(shouldRefreshNow({ ...base, lastTypedAt: now - 3_000 }), true);
  assert.ok(HIGHLIGHT_MS <= 1_000);
});
