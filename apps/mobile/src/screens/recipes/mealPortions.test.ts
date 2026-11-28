/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cookLines } from "./cookFromKho";
import { dishRiceGrams, mealHasRice, portionLabel, RICE_NOTE, withRice } from "./mealPortions";
import { scaleRecipe } from "./portions";
import type { Recipe } from "./recipeTypes";

const thitKho = { id: "r1", name: "Thịt kho", servings: 4, ingredients: [], mealTypes: [], dietaryTags: [], ingredientDetails: [{ name: "Thịt ba chỉ", quantity: 400, unit: "GRAM" }, { name: "Nước mắm", quantity: 30, unit: "MILLILITER", isSeasoning: true }] } as unknown as Recipe;

test("servings label: several dishes in the meal → 'Đủ cho N người' (no confusing 'N phần'); a single-dish meal keeps 'N phần'", () => {
  assert.equal(portionLabel(2, 2, 4), "Đủ cho 4 người");
  assert.equal(portionLabel(3, 5, 4), "Đủ cho 4 người");
  assert.equal(portionLabel(1, 4, 4), "4 phần");
  assert.equal(portionLabel(1, 5, 4), "5 phần");
  // The label never changes the amounts: still scaled to the planned 2 servings.
  const main = { ...scaleRecipe(thitKho, 2, 4), portionLabel: portionLabel(2, 2, 4) };
  assert.equal(main.ingredientDetails?.[0].quantity, 200);
  assert.equal(main.portionLabel, "Đủ cho 4 người");
});

test("Kèm cơm trắng: the món mặn lists the meal's Gạo; cooking it takes the rice out of Kho once", () => {
  const meal = [
    { mealType: "LUNCH", details: { role: "man", servings: 3, riceGrams: 380 } },
    { mealType: "LUNCH", details: { role: "canh", servings: 4 } },
  ];
  assert.equal(mealHasRice(meal), true);
  assert.equal(mealHasRice([{ mealType: "BREAKFAST", details: { role: "sang", servings: 4 } }]), false);
  assert.equal(dishRiceGrams(meal[0]), 380);
  assert.equal(dishRiceGrams(meal[1]), 0);

  const main = withRice(scaleRecipe(thitKho, 3, 4), dishRiceGrams(meal[0]));
  assert.equal(main.mealNote, RICE_NOTE);
  // "Hoàn thành" on the món mặn: its ingredients plus the meal's Gạo (seasonings stay out).
  assert.deepEqual(cookLines(main.ingredientDetails ?? []), [{ name: "Thịt ba chỉ", quantity: 300, unit: "GRAM" }, { name: "Gạo", quantity: 380, unit: "GRAM" }]);
  // The canh does not carry rice: cooking it never takes rice a second time.
  const soup = withRice(scaleRecipe({ ...thitKho, id: "r2", name: "Canh" }, 4, 4), dishRiceGrams(meal[1]));
  assert.equal(cookLines(soup.ingredientDetails ?? []).some((line) => line.name === "Gạo"), false);
  assert.equal(soup.mealNote, undefined);
});

test("older saved menus (rice kcal only): the món mặn's Gạo is derived only for a Vietnamese món mặn", () => {
  const old = { mealType: "DINNER", details: { role: "man", servings: 2, riceKcal: 1054 } };
  assert.equal(dishRiceGrams(old, { role: "man", cuisine: "vietnam" }), 330);
  assert.equal(dishRiceGrams(old, { role: "man", cuisine: "asian" }), 0);
  assert.equal(dishRiceGrams({ ...old, details: { role: "mot_mon", riceKcal: 1054 } }, { role: "mot_mon", cuisine: "western" }), 0);
  // Without the recipe the stored role decides (Vietnamese by default).
  assert.equal(dishRiceGrams(old), 330);
  assert.equal(mealHasRice([old], () => ({ role: "man", cuisine: "asian" })), false);
});
