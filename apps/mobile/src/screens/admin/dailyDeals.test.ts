/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { dayLabel, formOf, settingsErrors, settingsPayload, settingsSummary, sourceLabel, statusNote } from "./dailyDeals";

const defaults = { enabled: true, dealsPerDay: 10, minPercent: 5, maxPercent: 20, excludedProductIds: [] as string[] };

test("settings validation: 1-30 per day, whole percents 1-50, lowest ≤ highest", () => {
  assert.deepEqual(settingsErrors(formOf(defaults)), {});
  assert.equal(settingsErrors({ ...formOf(defaults), dealsPerDay: "0" }).dealsPerDay, "Từ 1 đến 30 sản phẩm mỗi ngày");
  assert.equal(settingsErrors({ ...formOf(defaults), dealsPerDay: "31" }).dealsPerDay, "Từ 1 đến 30 sản phẩm mỗi ngày");
  assert.equal(settingsErrors({ ...formOf(defaults), minPercent: "7.5" }).minPercent, "Phần trăm nguyên từ 1 đến 50");
  assert.equal(settingsErrors({ ...formOf(defaults), maxPercent: "60" }).maxPercent, "Phần trăm nguyên từ 1 đến 50");
  assert.deepEqual(settingsErrors({ ...formOf(defaults), minPercent: "25", maxPercent: "20" }), { maxPercent: "Mức cao nhất phải từ mức thấp nhất trở lên" });
  assert.equal(settingsErrors({ ...formOf(defaults), dealsPerDay: "" }).dealsPerDay, "Từ 1 đến 30 sản phẩm mỗi ngày");
});

test("payload and form round-trip", () => {
  assert.deepEqual(settingsPayload({ ...formOf(defaults), dealsPerDay: " 12 ", excludedProductIds: ["p1"] }), { ...defaults, dealsPerDay: 12, excludedProductIds: ["p1"] });
});

test("list texts", () => {
  assert.equal(statusNote("APPLIED"), null);
  assert.equal(statusNote("MANUAL_DISCOUNT"), "Đang có giảm giá thủ công, không áp dụng");
  assert.equal(sourceLabel("MENU"), "Món hay dùng");
  assert.equal(dayLabel("2026-11-27"), "Thứ Sáu, 27/11/2026");
  assert.equal(settingsSummary(defaults), "Giảm 5–20% · 10 sản phẩm mỗi ngày");
  assert.equal(settingsSummary({ minPercent: 10, maxPercent: 10, dealsPerDay: 3 }), "Giảm 10% · 3 sản phẩm mỗi ngày");
});
