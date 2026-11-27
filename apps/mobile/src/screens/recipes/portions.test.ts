/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { dishServings, scaleRecipe } from "./portions";
import type { Recipe } from "./recipeTypes";

const banhMi = {
  id: "r1", name: "Bánh mì trứng ốp la", servings: 2, calories: 410,
  ingredientDetails: [
    { name: "Bánh mì", quantity: 2, unit: "PIECE", perPerson: true },
    { name: "Trứng gà", quantity: 4, unit: "PIECE", perPerson: true },
    { name: "Bơ", quantity: 20, unit: "GRAM" },
  ],
  steps: [{ order: 1, instruction: "Ốp trứng", ingredients: [{ name: "Trứng gà", quantity: 4, unit: "PIECE", perPerson: true }] }],
} as unknown as Recipe;

test("servings shown = planned portions, always matching the scaled amounts; 'cho N người' stays the family size", () => {
  const scaled = scaleRecipe(banhMi, 4, 4);
  // Header "4 phần" (not the recipe's base "2 phần") with 4 bánh mì and 8 trứng.
  assert.equal(scaled.servings, 4);
  assert.equal(scaled.portionPeople, 4);
  assert.deepEqual(scaled.ingredientDetails?.map((line) => line.quantity), [4, 8, 40]);
  assert.equal(scaled.steps?.[0].ingredients?.[0].quantity, 8);
  // Calorie-based portions differ from the family size: amounts follow the portions, the label the family.
  const five = scaleRecipe(banhMi, 5, 4);
  assert.equal(five.servings, 5);
  assert.equal(five.portionPeople, 4);
  assert.deepEqual(five.ingredientDetails?.map((line) => line.quantity), [5, 10, 50]);
});

test("a dish's portions: stored per dish (calorie-based menus), else the menu's people, else the family size", () => {
  assert.equal(dishServings({ servings: 3, role: "man" }, 4, 4), 3);
  assert.equal(dishServings({ role: "man" }, 4, 5), 4);
  assert.equal(dishServings(null, null, 5), 5);
  assert.equal(dishServings({ servings: 0 }, null, null), 1);
});
