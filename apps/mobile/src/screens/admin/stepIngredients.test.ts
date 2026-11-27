/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { addStepIngredient, pickerOptions, recipeIngredientNames, removeStepIngredient, stepTags } from "./stepIngredients";

const recipe = recipeIngredientNames([{ name: "Tôm" }, { name: " Tỏi " }, { name: "" }, { name: "Hành lá" }, { name: "Tôm" }, { name: "Đậu phụ" }]);

test("recipe names: trimmed, non-empty, once each, in recipe order", () => {
  assert.deepEqual(recipe, ["Tôm", "Tỏi", "Hành lá", "Đậu phụ"]);
});

test("a step shows only its own ingredients as tags; removed recipe ingredients disappear", () => {
  assert.deepEqual(stepTags(["Tôm", "Cà chua"], recipe), ["Tôm"]);
  assert.deepEqual(stepTags([], recipe), []);
});

test("the picker lists ingredients not attached yet, searchable without accents", () => {
  assert.deepEqual(pickerOptions(recipe, ["Tôm"]), ["Tỏi", "Hành lá", "Đậu phụ"]);
  assert.deepEqual(pickerOptions(recipe, ["Tôm"], "dau"), ["Đậu phụ"]);
  assert.deepEqual(pickerOptions(recipe, ["Tôm"], "HANH"), ["Hành lá"]);
  assert.deepEqual(pickerOptions(recipe, recipe), []);
});

test("add keeps the order and never duplicates; remove (✕) drops only that tag — same saved list as before", () => {
  let step: string[] = [];
  step = addStepIngredient(step, "Tỏi");
  step = addStepIngredient(step, "Tôm");
  step = addStepIngredient(step, "Tỏi");
  assert.deepEqual(step, ["Tỏi", "Tôm"]);
  assert.deepEqual(removeStepIngredient(step, "Tỏi"), ["Tôm"]);
});
