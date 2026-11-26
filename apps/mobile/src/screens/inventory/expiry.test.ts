/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { daysUntil, expiryInfo } from "./expiry";

const today = new Date(2026, 10, 26, 10, 0); // 26/11/2026, local time

test("an expired item shows a red 'Hết hạn' pill and red HSD text, even if the stored status still says FRESH", () => {
  const info = expiryInfo({ expiryDate: "2026-11-24T00:00:00.000Z", status: "FRESH" }, today);
  assert.deepEqual(info, { text: "HSD 24/11", tone: "danger", pill: { label: "Hết hạn", tone: "danger" } });
  assert.equal(expiryInfo({ expiryDate: "2026-11-25T00:00:00.000Z", status: "FRESH" }, today).pill?.label, "Hết hạn");
});

test("near expiry: amber 'Hôm nay' / 'Còn N ngày' up to 3 days; later dates have no pill", () => {
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-26T00:00:00.000Z" }, today).pill, { label: "Hôm nay", tone: "warning" });
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-29T00:00:00.000Z" }, today).pill, { label: "Còn 3 ngày", tone: "warning" });
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-30T00:00:00.000Z" }, today), { text: "HSD 30/11", tone: null, pill: null });
});

test("another year shows the year, so a 2028 date is not mistaken for an expired '24/11'", () => {
  const info = expiryInfo({ expiryDate: "2028-11-24T00:00:00.000Z", status: "FRESH" }, today);
  assert.deepEqual(info, { text: "HSD 24/11/2028", tone: null, pill: null });
  assert.equal(expiryInfo({ expiryDate: "2025-12-31T00:00:00.000Z" }, today).text, "HSD 31/12/2025");
});

test("no expiry date: 'Chưa có HSD', unless the server marked it EXPIRED", () => {
  assert.deepEqual(expiryInfo({ expiryDate: null }, today), { text: "Chưa có HSD", tone: null, pill: null });
  assert.equal(expiryInfo({ expiryDate: null, status: "EXPIRED" }, today).pill?.label, "Hết hạn");
  assert.equal(daysUntil("2026-11-24", today), -2);
});
