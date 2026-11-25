/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { amountText, formatWeight, unitLine, unitWord } from "./unitDisplay";

test("unit words: one word per code, the product's own word for piece-type units only", () => {
  assert.equal(unitWord("KILOGRAM"), "kg");
  assert.equal(unitWord("PACK"), "gói");
  assert.equal(unitWord("PIECE"), "cái");
  assert.equal(unitWord("PIECE", "quả"), "quả");
  assert.equal(unitWord("BOTTLE"), "chai");
  assert.equal(unitWord("BOX", "hộp"), "hộp");
  // A label only applies to piece-type units, and only a known word.
  assert.equal(unitWord("PACK", "quả"), "gói");
  assert.equal(unitWord("PIECE", "con"), "cái");
  // Older free-text units.
  assert.equal(unitWord("kg"), "kg");
  assert.equal(unitWord("g"), "g");
});

test("weights: kg from 1000 g, grams below; ml / lít for volumes; decimal comma", () => {
  assert.equal(formatWeight(1200), "1,2 kg");
  assert.equal(formatWeight(1000), "1 kg");
  assert.equal(formatWeight(1250), "1,25 kg");
  assert.equal(formatWeight(450), "450 g");
  assert.equal(formatWeight(55.4), "55 g");
  assert.equal(formatWeight(500, true), "500 ml");
  assert.equal(formatWeight(1000, true), "1 lít");
});

test("card unit line: 1 kg, 1 gói (no weight), pieces with their approximate weight when known", () => {
  assert.equal(unitLine({ unit: "KILOGRAM" }), "1 kg");
  assert.equal(unitLine({ unit: "PACK", packGrams: 100 }), "1 gói");
  assert.equal(unitLine({ unit: "PIECE", unitLabel: "quả", packGrams: 1200 }), "1 quả ≈ 1,2 kg");
  assert.equal(unitLine({ unit: "PIECE", unitLabel: "bìa", packGrams: 200 }), "1 bìa ≈ 200 g");
  assert.equal(unitLine({ unit: "BOTTLE", packGrams: 500 }), "1 chai ≈ 500 ml");
  assert.equal(unitLine({ unit: "CAN", packGrams: 380 }), "1 lon ≈ 380 g");
  assert.equal(unitLine({ unit: "PIECE", packGrams: null }), "1 cái");
});

test("amounts: 0,7 kg, 1,5 kg, 2 gói, 3 quả", () => {
  assert.equal(amountText(0.7, "KILOGRAM"), "0,7 kg");
  assert.equal(amountText(1.5, "KILOGRAM"), "1,5 kg");
  assert.equal(amountText(2, "PACK"), "2 gói");
  assert.equal(amountText(3, "PIECE", "quả"), "3 quả");
  assert.equal(amountText(500, "MILLILITER"), "500 ml");
});
