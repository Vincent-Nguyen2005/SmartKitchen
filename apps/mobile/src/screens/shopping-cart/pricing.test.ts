/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { formatVnd } from "../../services/format";
import { cartTotal, lineTotal, unitPriceAfterDiscount, unitPriceText } from "./pricing";

test("line total = unit price × quantity, kg decimals included", () => {
  assert.equal(lineTotal(300_000, 1.5), 450_000);
  assert.equal(formatVnd(lineTotal(300_000, 1.5) ?? 0), "450.000đ");
  assert.equal(lineTotal(300_000, 0.1), 30_000);
  assert.equal(lineTotal(5_000, 3), 15_000);
  assert.equal(lineTotal(null, 2), null);
});

test("active discount: unit price rounded to whole đồng first, then × quantity, rounded", () => {
  const unit = unitPriceAfterDiscount(33_333, 15);
  assert.equal(unit, 28_333); // 33.333 × 0,85 = 28.333,05 → 28.333
  assert.equal(lineTotal(unit, 1.5), 42_500); // 42.499,5 → 42.500
  assert.equal(unitPriceAfterDiscount(300_000, null), 300_000);
  assert.equal(unitPriceAfterDiscount(null, 10), null);
});

test("cart total equals the sum of the line totals shown (rounding per line)", () => {
  const lines = [{ unitPrice: 3_333, quantity: 1.5 }, { unitPrice: 3_333, quantity: 1.5 }, { unitPrice: null, quantity: 2 }];
  const shown = lines.map((line) => lineTotal(line.unitPrice, line.quantity) ?? 0);
  assert.deepEqual(shown, [5_000, 5_000, 0]);
  assert.equal(cartTotal(lines), 10_000);
  // Rounding the unrounded sum instead would give 9.999đ.
  assert.equal(Math.round(3_333 * 1.5 * 2), 9_999);
});

test("unit price line: dots, no decimals, '/ unit word'", () => {
  assert.equal(unitPriceText(300_000, "kg"), "300.000đ / kg");
  assert.equal(unitPriceText(5_000, "gói"), "5.000đ / gói");
});
