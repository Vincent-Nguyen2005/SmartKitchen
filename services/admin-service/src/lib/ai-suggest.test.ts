import { describe, expect, it } from "vitest";
import { createDailyLimit, validateIngredientSuggestion, validateRecipeSuggestion } from "./ai-suggest";

const GROUPS = ["Rau củ", "Thịt", "Hải sản", "Gia vị"];

describe("ingredient suggestions: only values the form accepts", () => {
  it("keeps valid values; group / unit / word / allergens constrained to the fixed lists", () => {
    const suggestion = validateIngredientSuggestion({
      name: "  Cà   chua ", category: "rau cu", defaultUnit: "kilogram", unitLabel: "quả", packGrams: 500, pieceGrams: 120.4,
      englishName: "Tomato", caloriesPer100g: 18.4, proteinPer100g: 0.88, carbsPer100g: 3.9, fatPer100g: 0.2,
      allergens: ["Sữa", "nấm", "trứng", "sữa"], shelfLifeDays: 7, price: 24_800, confidence: 0.83, notes: "Cà chua chín.",
    }, GROUPS);
    expect(suggestion).toEqual({
      name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM",
      // unitLabel only for piece-type units; packGrams only for packs / piece units; pieceGrams for kg / pack.
      unitLabel: null, packGrams: null, pieceGrams: 120,
      englishName: "tomato", caloriesPer100g: 18, proteinPer100g: 0.9, carbsPer100g: 3.9, fatPer100g: 0.2,
      allergens: ["sữa", "trứng"], shelfLifeDays: 7, price: 25_000, confidence: 0.83, notes: "Cà chua chín.",
    });
  });

  it("drops invalid AI output: unknown group / unit, out-of-range numbers, wrong types, too-long text", () => {
    const suggestion = validateIngredientSuggestion({
      name: "x".repeat(200), category: "Đồ điện tử", defaultUnit: "TON", unitLabel: "con", caloriesPer100g: 2000, proteinPer100g: -1,
      carbsPer100g: "nhiều", allergens: "sữa", shelfLifeDays: 0, price: -5, confidence: 7, notes: 42,
    }, GROUPS);
    expect(suggestion).toEqual({
      name: null, category: null, defaultUnit: null, unitLabel: null, packGrams: null, pieceGrams: null, englishName: null,
      caloriesPer100g: null, proteinPer100g: null, carbsPer100g: null, fatPer100g: null, allergens: [], shelfLifeDays: null, price: null, confidence: null, notes: null,
    });
    expect(validateIngredientSuggestion(null, GROUPS).name).toBeNull();
    expect(validateIngredientSuggestion("not json object", GROUPS).allergens).toEqual([]);
  });

  it("piece-type units keep their word and pack weight", () => {
    const egg = validateIngredientSuggestion({ name: "Trứng vịt", defaultUnit: "PIECE", unitLabel: "quả", packGrams: 70, pieceGrams: 70 }, GROUPS);
    expect([egg.unitLabel, egg.packGrams, egg.pieceGrams]).toEqual(["quả", 70, null]);
  });
});

describe("dish suggestions: recipe form rules and catalog mapping", () => {
  const catalog = [{ name: "Thịt bò", englishName: "beef" }, { name: "Bánh phở", englishName: null }, { name: "Hành lá", englishName: "scallion" }];

  it("maps lines to catalog products (accents / English names), lists unmapped names, keeps valid fields", () => {
    const suggestion = validateRecipeSuggestion({
      name: "Phở bò", cuisine: "VN", servings: 4, caloriesPerServing: 450.6,
      ingredients: [
        { name: "thit bo", quantity: 400, unit: "gram" },
        { name: "Scallion", quantity: 2, unit: null },
        { name: "Bánh phở", quantity: 500, unit: "GRAM" },
        { name: "Quế", quantity: 1, unit: "PIECE" },
        { name: "Thịt bò", quantity: 100, unit: "GRAM" },
        { name: "quế", quantity: 2, unit: "PIECE" },
        { quantity: 3 },
      ],
      steps: ["Luộc xương lấy nước dùng.", "  ", "Trụng bánh phở.", 7, "x".repeat(600)],
      confidence: 0.6, notes: null,
    }, catalog);
    expect(suggestion).toEqual({
      name: "Phở bò", cuisine: "vietnam", servings: 4, caloriesPerServing: 451,
      ingredients: [
        { name: "Thịt bò", quantity: 400, unit: "GRAM" },
        // A quantity without a valid unit is not kept (the form needs both).
        { name: "Hành lá", quantity: null, unit: null },
        { name: "Bánh phở", quantity: 500, unit: "GRAM" },
      ],
      unmatched: ["Quế"],
      steps: ["Luộc xương lấy nước dùng.", "Trụng bánh phở."],
      confidence: 0.6, notes: null,
    });
  });

  it("invalid dish output becomes empty; steps capped at 15", () => {
    const suggestion = validateRecipeSuggestion({ name: "", cuisine: "martian", servings: 500, caloriesPerServing: -3, ingredients: "beef", steps: Array.from({ length: 20 }, (_, index) => `Bước ${index + 1}`) }, catalog);
    expect(suggestion).toMatchObject({ name: null, cuisine: null, servings: null, caloriesPerServing: null, ingredients: [], unmatched: [] });
    expect(suggestion.steps).toHaveLength(15);
    expect(validateRecipeSuggestion(undefined, catalog).steps).toEqual([]);
  });
});

describe("daily limit", () => {
  it("per admin and Vietnam day", () => {
    let now = new Date("2026-11-27T16:00:00Z"); // 23:00 in Vietnam
    const limit = createDailyLimit(2, () => now);
    expect([limit.take("a"), limit.take("a"), limit.take("a"), limit.take("b")]).toEqual([true, true, false, true]);
    now = new Date("2026-11-27T17:30:00Z"); // 00:30 the next Vietnam day
    expect(limit.take("a")).toBe(true);
  });
});
