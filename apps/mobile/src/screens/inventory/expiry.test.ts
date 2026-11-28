/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { daysUntil, expiryInfo, listedInKho } from "./expiry";

/** hh:mm on a Vietnam calendar day, as an instant (independent of the test machine's time zone). */
const vn = (date: string, time = "10:00") => new Date(new Date(`${date}T${time}:00.000Z`).getTime() - 7 * 3_600_000);
const today = vn("2026-11-26");

test("expiry day: amber 'Hết hạn hôm nay', not dimmed (still usable)", () => {
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-26T00:00:00.000Z" }, today), { text: "HSD 26/11", tone: "warning", pill: { label: "Hết hạn hôm nay", tone: "warning" }, dimmed: false });
});

test("grace days after expiry: red 'Đã hết hạn N ngày', dimmed, even if the stored status still says FRESH", () => {
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-24T00:00:00.000Z", status: "FRESH" }, today), { text: "HSD 24/11", tone: "danger", pill: { label: "Đã hết hạn 2 ngày", tone: "danger" }, dimmed: true });
  assert.equal(expiryInfo({ expiryDate: "2026-11-25T00:00:00.000Z" }, today).pill?.label, "Đã hết hạn 1 ngày");
});

test("near expiry: amber 'Còn N ngày' up to 3 days; later dates have no pill", () => {
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-27T00:00:00.000Z" }, today).pill, { label: "Còn 1 ngày", tone: "warning" });
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-29T00:00:00.000Z" }, today).pill, { label: "Còn 3 ngày", tone: "warning" });
  assert.deepEqual(expiryInfo({ expiryDate: "2026-11-30T00:00:00.000Z" }, today), { text: "HSD 30/11", tone: null, pill: null, dimmed: false });
});

test("Vietnam days: 00:30 in Vietnam is already the next day", () => {
  assert.equal(daysUntil("2026-11-26", vn("2026-11-26", "23:59")), 0);
  assert.equal(daysUntil("2026-11-26", vn("2026-11-27", "00:30")), -1);
  assert.equal(daysUntil("2026-11-24", today), -2);
});

test("another year shows the year, so a 2028 date is not mistaken for an expired '24/11'", () => {
  assert.deepEqual(expiryInfo({ expiryDate: "2028-11-24T00:00:00.000Z", status: "FRESH" }, today), { text: "HSD 24/11/2028", tone: null, pill: null, dimmed: false });
  assert.equal(expiryInfo({ expiryDate: "2025-12-31T00:00:00.000Z" }, today).text, "HSD 31/12/2025");
});

test("no expiry date: 'Chưa có HSD', unless the server marked it EXPIRED", () => {
  assert.deepEqual(expiryInfo({ expiryDate: null }, today), { text: "Chưa có HSD", tone: null, pill: null, dimmed: false });
  assert.equal(expiryInfo({ expiryDate: null, status: "EXPIRED" }, today).pill?.label, "Hết hạn");
});

test("the list keeps the server's grace days: 0 hides from the day after expiry, 3 keeps 3 days; no date always stays", () => {
  const items = [
    { id: "today", expiryDate: "2026-11-26T00:00:00.000Z" },
    { id: "1-day", expiryDate: "2026-11-25T00:00:00.000Z" },
    { id: "3-days", expiryDate: "2026-11-23T00:00:00.000Z" },
    { id: "4-days", expiryDate: "2026-11-22T00:00:00.000Z" },
    { id: "none", expiryDate: null },
  ];
  assert.deepEqual(listedInKho(items, 0, today).map((item) => item.id), ["today", "none"]);
  assert.deepEqual(listedInKho(items, 3, today).map((item) => item.id), ["today", "1-day", "3-days", "none"]);
});
