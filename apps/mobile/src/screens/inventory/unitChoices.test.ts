/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { UNIT_LABELS, unitLabel } from "./catalogSuggest";
import { choiceFor, choiceLabel, kitchenAmount, kitchenUnitWord, storedUnitLabel, UNIT_CHOICES } from "./unitChoices";

test("picker offers specific words only, in the agreed order", () => {
  assert.deepEqual(UNIT_CHOICES.map((choice) => choice.label), ["gói", "cái", "quả", "trái", "bìa", "nải", "hộp", "chai", "lon", "g", "kg", "ml", "lít"]);
  for (const choice of UNIT_CHOICES) assert.ok(!choice.label.includes("/"), choice.label);
});

test("each word maps to the stored unit + piece word, and back", () => {
  assert.deepEqual(choiceFor("quả"), { label: "quả", unit: "PIECE", unitLabel: "quả" });
  assert.deepEqual(choiceFor("cái"), { label: "cái", unit: "PIECE", unitLabel: null });
  assert.deepEqual(choiceFor("gói"), { label: "gói", unit: "PACK", unitLabel: null });
  assert.deepEqual(choiceFor("lít"), { label: "lít", unit: "LITER", unitLabel: null });
  assert.equal(choiceFor("cái/quả"), null);
  for (const choice of UNIT_CHOICES) assert.equal(choiceLabel(choice.unit, choice.unitLabel), choice.label);
  assert.equal(choiceLabel("PIECE", null), "cái");
  assert.equal(storedUnitLabel("PACK", "quả"), null);
  assert.equal(storedUnitLabel("PIECE", "cái"), null);
});

test("display: the linked product's word, else the user's word, else the unit's word — never combined", () => {
  assert.equal(kitchenUnitWord({ unit: "PIECE", unitLabel: null }, "bìa"), "bìa");
  assert.equal(kitchenUnitWord({ unit: "PIECE", unitLabel: "trái" }, "quả"), "quả");
  assert.equal(kitchenUnitWord({ unit: "PIECE", unitLabel: "trái" }), "trái");
  assert.equal(kitchenUnitWord({ unit: "PIECE" }), "cái");
  assert.equal(kitchenUnitWord({ unit: "PACK" }, "quả"), "gói");
  assert.equal(kitchenAmount({ quantity: 1, unit: "PACK" }), "1 gói");
  assert.equal(kitchenAmount({ quantity: 2, unit: "PIECE", unitLabel: "quả" }), "2 quả");
  assert.equal(kitchenAmount({ quantity: 1.5, unit: "KILOGRAM" }), "1,5 kg");
});

test("shared unit labels have no combined words (recipes, admin, cart)", () => {
  for (const label of Object.values(UNIT_LABELS)) assert.ok(!label.includes("/"), label);
  assert.equal(unitLabel("PIECE"), "cái");
  assert.equal(unitLabel("PACK"), "gói");
});
