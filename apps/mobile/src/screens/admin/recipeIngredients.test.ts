/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PER_PERSON, savedIngredient } from "./recipeIngredients";

const row = (overrides: Partial<Parameters<typeof savedIngredient>[0]> = {}) => ({ name: " Trứng gà ", quantity: "2", unit: "PIECE", isSeasoning: false, perPerson: true, ...overrides });

test("'Theo người' is hidden but kept: a stored true / false is saved unchanged; new rows keep the default", () => {
  assert.deepEqual(savedIngredient(row()), { detail: { name: "Trứng gà", quantity: 2, unit: "PIECE", note: null, perPerson: true } });
  assert.deepEqual(savedIngredient(row({ perPerson: false })), { detail: { name: "Trứng gà", quantity: 2, unit: "PIECE", note: null, perPerson: false } });
  assert.equal(DEFAULT_PER_PERSON, false);
});

test("amounts: numbers (comma decimals), free text as note, 0 refused; seasoning flag only when set", () => {
  assert.deepEqual(savedIngredient(row({ quantity: "1,5", perPerson: false })), { detail: { name: "Trứng gà", quantity: 1.5, unit: "PIECE", note: null, perPerson: false } });
  assert.deepEqual(savedIngredient(row({ name: "Muối", quantity: "vừa ăn", isSeasoning: true, perPerson: false })), { detail: { name: "Muối", quantity: null, unit: null, note: "vừa ăn", isSeasoning: true, perPerson: false } });
  assert.deepEqual(savedIngredient(row({ quantity: "0" })), { error: 'Số lượng của "Trứng gà" phải lớn hơn 0.' });
});
