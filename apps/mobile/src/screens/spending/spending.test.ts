/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { barFractions, buyerOf, canGoNext, comparisonLine, currentMonth, itemCountText, lineQuantity, monthTitle, purchaseTime, shiftMonth, vnd, vndSpoken } from "./spending";

test("months follow Vietnam time; no future months", () => {
  assert.equal(currentMonth(new Date("2026-11-30T16:59:00Z")), "2026-11"); // 23:59 on 30/11 in Vietnam
  assert.equal(currentMonth(new Date("2026-11-30T17:00:00Z")), "2026-12"); // 00:00 on 1/12
  assert.equal(shiftMonth("2026-11", 1), "2026-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  const now = new Date("2026-11-26T05:00:00Z");
  assert.equal(canGoNext("2026-11", now), false);
  assert.equal(canGoNext("2026-10", now), true);
  assert.equal(monthTitle("2026-11"), "Tháng 11/2026");
});

test("comparison with the previous month: arrow and tone, hidden without a previous month", () => {
  assert.deepEqual(comparisonLine(12, "2026-10"), { text: "↑ 12% so với tháng 10", tone: "up" });
  assert.deepEqual(comparisonLine(-5, "2026-10"), { text: "↓ 5% so với tháng 10", tone: "down" });
  assert.deepEqual(comparisonLine(0, "2026-10"), { text: "Bằng tháng 10", tone: "same" });
  assert.equal(comparisonLine(null, "2026-10"), null);
});

test("numbers: VND with dots and đ, spoken as đồng; quantities with a decimal comma and unit words", () => {
  assert.equal(vnd(1_250_000), "1.250.000đ");
  assert.equal(vnd(0), "0đ");
  assert.equal(vndSpoken(1_250_000), "1.250.000 đồng");
  assert.equal(lineQuantity({ quantity: 1.5, unit: "KILOGRAM", unitLabel: null }), "1,5 kg");
  assert.equal(lineQuantity({ quantity: 2, unit: "PACK", unitLabel: null }), "2 gói");
  assert.equal(lineQuantity({ quantity: 3, unit: "PIECE", unitLabel: "quả" }), "3 quả");
  assert.equal(itemCountText(4), "4 món");
});

test("purchase time in Vietnam time", () => {
  assert.equal(purchaseTime("2026-11-26T11:05:00.000Z"), "26/11 · 18:05");
  assert.equal(purchaseTime("2026-11-30T17:30:00.000Z"), "01/12 · 00:30");
});

test("bars are relative to the largest group", () => {
  assert.deepEqual(barFractions([{ name: "Thịt", amount: 800, percent: 67 }, { name: "Rau củ", amount: 400, percent: 33 }]), [1, 0.5]);
  assert.deepEqual(barFractions([]), []);
});

test("buyer: the family member, else a neutral label", () => {
  const members = [{ userId: "u1", displayName: "Lan", avatarUrl: "https://x/a.jpg" }, { userId: "u2", displayName: " " }];
  assert.deepEqual(buyerOf(members, "u1"), { name: "Lan", avatarUrl: "https://x/a.jpg" });
  assert.deepEqual(buyerOf(members, "u2"), { name: "Thành viên", avatarUrl: null });
  assert.deepEqual(buyerOf(members, "u9"), { name: "Thành viên cũ", avatarUrl: null });
  assert.deepEqual(buyerOf(members, null), { name: "Không rõ người mua", avatarUrl: null });
});
