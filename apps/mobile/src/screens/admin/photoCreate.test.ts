/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import {
  confidenceText, CREATE_KIND_OPTIONS, duplicateDialog, findDuplicate, ingredientValuesFrom, isAiValue, recipeValuesFrom, recognitionOutcome, replacePhotoDialog,
  type IngredientSuggestion, type RecipeSuggestion,
} from "./photoCreate";

const ingredient: IngredientSuggestion = {
  name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", unitLabel: null, packGrams: null, pieceGrams: 100, englishName: "tomato",
  caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 3.9, fatPer100g: 0.2, allergens: [], shelfLifeDays: 7, price: 25_000, confidence: 0.82, notes: null,
};

test("Chụp ảnh asks Nguyên liệu or Món ăn", () => {
  assert.deepEqual(CREATE_KIND_OPTIONS.map((option) => option.label), ["Nguyên liệu", "Món ăn"]);
});

test("ingredient suggestion → form values (only filled fields, as text); none → nothing", () => {
  assert.deepEqual(ingredientValuesFrom(ingredient), {
    name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", pieceGrams: "100", englishName: "tomato",
    caloriesPer100g: "18", proteinPer100g: "0.9", carbsPer100g: "3.9", fatPer100g: "0.2", shelfLifeDays: "7", price: "25000",
  });
  assert.deepEqual(ingredientValuesFrom(null), {});
});

test("dish suggestion → form values", () => {
  const recipe: RecipeSuggestion = { name: "Phở bò", cuisine: "vietnam", servings: 4, caloriesPerServing: 450, ingredients: [], unmatched: ["Quế"], steps: [], confidence: null, notes: null };
  assert.deepEqual(recipeValuesFrom(recipe), { name: "Phở bò", cuisine: "vietnam", servings: "4", calories: "450" });
});

test("'Gợi ý AI' shows only while the field still holds the AI's value (editing removes it)", () => {
  const ai = ingredientValuesFrom(ingredient);
  assert.equal(isAiValue("name", "Cà chua", ai), true);
  assert.equal(isAiValue("name", "Cà chua bi", ai), false);
  assert.equal(isAiValue("unitLabel", "", ai), false);
});

test("duplicate warning: same name ignoring accents / case / spaces, not the item itself", () => {
  const items = [{ id: "1", name: "Cà chua" }, { id: "2", name: "Thịt bò" }];
  assert.deepEqual(findDuplicate("  ca CHUA ", items), { id: "1", name: "Cà chua" });
  assert.equal(findDuplicate("Cà chua", items, "1"), null);
  assert.equal(findDuplicate("Cà rốt", items), null);
  assert.equal(findDuplicate("   ", items), null);
  assert.deepEqual(duplicateDialog("Cà chua"), { title: 'Đã có "Cà chua" trong danh mục', message: "Mở mục đã có để sửa, hoặc vẫn tạo mục mới trùng tên.", cancelLabel: "Mở món đó", confirmLabel: "Vẫn tạo mới" });
});

test("edit-form photo: replacing asks 'Thay ảnh của <tên>?'", () => {
  assert.deepEqual(replacePhotoDialog("Phở bò"), { title: "Thay ảnh của Phở bò?", message: "Ảnh hiện tại sẽ được thay bằng ảnh vừa chọn.", confirmLabel: "Thay ảnh", destructive: true });
});

test("recognition off / failed / limited / offline → the empty form with the photo and a note", () => {
  assert.deepEqual(recognitionOutcome({ status: 200 }), { prefill: true, note: null });
  assert.equal(recognitionOutcome({ status: 503, error: "AI_OFF" }).prefill, false);
  assert.match(recognitionOutcome({ status: 503, error: "AI_OFF" }).note ?? "", /đang tắt/);
  assert.match(recognitionOutcome({ status: 429, error: "AI_LIMIT" }).note ?? "", /hết lượt/);
  assert.equal(recognitionOutcome({ status: 502, error: "AI_FAILED" }).prefill, false);
  assert.equal(recognitionOutcome(null).prefill, false);
  assert.equal(confidenceText(0.82), "Độ tin cậy 82%");
  assert.equal(confidenceText(null), null);
});
