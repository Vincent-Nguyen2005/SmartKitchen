/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsAutoSave, dayLabel, dealPriceParts, dealTabMemory, DEAL_TABS, formOf, percentRangeText, saveStatusText, settingsErrors, settingsPayload, statusNote, swapNotice, switchLabel, todayHeader, type DealSettings } from "./dailyDeals";
import type { AutoSaveState } from "../../services/autoSave";

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
  assert.equal(dayLabel("2026-11-27"), "Thứ Sáu, 27/11/2026");
  assert.equal(todayHeader("2026-11-28", defaults), "Thứ Bảy, 28/11/2026 · Giảm 5–20%");
  assert.equal(percentRangeText({ minPercent: 10, maxPercent: 10 }), "Giảm 10%");
});

test("tabs: Hôm nay (default) and Cài đặt, remembered for the session", () => {
  assert.deepEqual(DEAL_TABS.map((tab) => tab.label), ["Hôm nay", "Cài đặt"]);
  assert.equal(dealTabMemory.get(), "today");
  assert.equal(dealTabMemory.set("settings"), "settings");
  assert.equal(dealTabMemory.get(), "settings");
  assert.equal(dealTabMemory.set("nope"), "today");
});

test("row price line: original → discounted per sale unit (Đi chợ rounding and words); none without a price", () => {
  assert.deepEqual(dealPriceParts({ price: 12_000, percent: 4, unit: "PACK", unitLabel: null }), { original: "12.000đ", discounted: "11.520đ / gói" });
  assert.deepEqual(dealPriceParts({ price: 25_000, percent: 15, unit: "PIECE", unitLabel: "quả" }), { original: "25.000đ", discounted: "21.250đ / quả" });
  assert.deepEqual(dealPriceParts({ price: 300_000, percent: 10, unit: null }), { original: "300.000đ", discounted: "270.000đ" });
  assert.equal(dealPriceParts({ price: null, percent: 10, unit: "KILOGRAM" }), null);
});

test("Đổi nguyên liệu toast names the product that came in", () => {
  assert.equal(swapNotice([{ productId: "a" }, { productId: "b" }], [{ productId: "a", name: "Cà rốt" }, { productId: "c", name: "Bắp cải" }]), "Đã đổi sang Bắp cải");
  assert.equal(swapNotice([{ productId: "a" }], [{ productId: "a", name: "Cà rốt" }]), "Đã đổi nguyên liệu");
});

/** Manual timers so the 600 ms pause is under test control. */
const fakeTimers = () => {
  let next: { callback: () => void; ms: number } | null = null;
  return {
    timers: { set: (callback: () => void, ms: number) => { next = { callback, ms }; return 1; }, clear: () => { next = null; } },
    pendingMs: () => next?.ms ?? null,
    fire: () => { const run = next; next = null; run?.callback(); },
  };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("Cài đặt auto-save: typing waits for the 600 ms pause, then sends the latest value once", async () => {
  const sent: DealSettings[] = [];
  const states: AutoSaveState[] = [];
  const clock = fakeTimers();
  const saver = createSettingsAutoSave({ initial: defaults, save: async (value) => { sent.push(value); }, onState: (state) => states.push(state), timers: clock.timers });
  saver.type({ ...formOf(defaults), dealsPerDay: "1" });
  saver.type({ ...formOf(defaults), dealsPerDay: "12" });
  assert.equal(clock.pendingMs(), 600);
  assert.equal(sent.length, 0);
  assert.equal(saveStatusText(states.at(-1)!), "Đang lưu…");
  clock.fire();
  await tick();
  assert.deepEqual(sent, [{ ...defaults, dealsPerDay: 12 }]);
  assert.equal(saveStatusText(states.at(-1)!), "Đã lưu");
});

test("Cài đặt auto-save: invalid values are not sent (inline errors), and a pending earlier value is dropped", async () => {
  const sent: DealSettings[] = [];
  const states: AutoSaveState[] = [];
  const clock = fakeTimers();
  const saver = createSettingsAutoSave({ initial: defaults, save: async (value) => { sent.push(value); }, onState: (state) => states.push(state), timers: clock.timers });
  saver.type({ ...formOf(defaults), dealsPerDay: "12" });
  assert.deepEqual(saver.type({ ...formOf(defaults), dealsPerDay: "12", minPercent: "30", maxPercent: "20" }), { maxPercent: "Mức cao nhất phải từ mức thấp nhất trở lên" });
  assert.equal(clock.pendingMs(), null);
  assert.deepEqual(saver.commit({ ...formOf(defaults), dealsPerDay: "0" }), { dealsPerDay: "Từ 1 đến 30 sản phẩm mỗi ngày" });
  await tick();
  assert.equal(sent.length, 0);
  assert.equal(saveStatusText(states.at(-1)!), null);
});

test("Cài đặt auto-save: switch, exclusions and blur save at once (no timer)", async () => {
  const sent: DealSettings[] = [];
  const clock = fakeTimers();
  const saver = createSettingsAutoSave({ initial: defaults, save: async (value) => { sent.push(value); }, timers: clock.timers });
  saver.commit({ ...formOf(defaults), enabled: false });
  await tick();
  assert.deepEqual(sent, [{ ...defaults, enabled: false }]);
  saver.commit({ ...formOf(defaults), enabled: false, excludedProductIds: ["p1"] });
  await tick();
  assert.deepEqual(sent.at(-1), { ...defaults, enabled: false, excludedProductIds: ["p1"] });
  assert.equal(clock.pendingMs(), null);
  // Nothing changed: nothing sent again.
  saver.commit({ ...formOf(defaults), enabled: false, excludedProductIds: ["p1"] });
  await tick();
  assert.equal(sent.length, 2);
});

test("switch label says what flipping it does", () => {
  assert.equal(switchLabel(true), "Tắt để dừng ngay");
  assert.equal(switchLabel(false), "Bật để chạy lại");
});
