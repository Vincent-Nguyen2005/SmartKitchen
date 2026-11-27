/**
 * Quản trị › "Chụp ảnh" creates a NEW ingredient or dish from a photo (pure; covered by photoCreate.test.ts): the
 * server's AI suggestions (already validated there) become prefilled form values, AI-filled fields are marked
 * "Gợi ý AI" until the admin changes them, and a duplicate name is caught before saving. AI never saves anything.
 */
export type CreateKind = "ingredient" | "recipe";
export const CREATE_KIND_OPTIONS: ReadonlyArray<{ value: CreateKind; label: string }> = [
  { value: "ingredient", label: "Nguyên liệu" },
  { value: "recipe", label: "Món ăn" },
];

export type IngredientSuggestion = {
  name: string | null; category: string | null; defaultUnit: string | null; unitLabel: string | null; packGrams: number | null; pieceGrams: number | null;
  englishName: string | null; caloriesPer100g: number | null; proteinPer100g: number | null; carbsPer100g: number | null; fatPer100g: number | null;
  allergens: string[]; shelfLifeDays: number | null; price: number | null; confidence: number | null; notes: string | null;
};
export type RecipeSuggestion = {
  name: string | null; cuisine: "vietnam" | "western" | "asian" | null; servings: number | null; caloriesPerServing: number | null;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
  unmatched: string[]; steps: string[]; confidence: number | null; notes: string | null;
};

/** Ingredient form text fields the AI can fill (form keys → string values). */
export type IngredientAiValues = Partial<Record<"name" | "category" | "defaultUnit" | "unitLabel" | "packGrams" | "pieceGrams" | "englishName" | "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g" | "shelfLifeDays" | "price", string>>;
const str = (value: number | string | null): string | undefined => (value === null || value === "" ? undefined : String(value));

/** Suggestion → the ingredient form's values (only filled fields; nothing else is touched). */
export function ingredientValuesFrom(suggestion: IngredientSuggestion | null): IngredientAiValues {
  if (!suggestion) return {};
  const entries: Array<[keyof IngredientAiValues, string | undefined]> = [
    ["name", str(suggestion.name)], ["category", str(suggestion.category)], ["defaultUnit", str(suggestion.defaultUnit)], ["unitLabel", str(suggestion.unitLabel)],
    ["packGrams", str(suggestion.packGrams)], ["pieceGrams", str(suggestion.pieceGrams)], ["englishName", str(suggestion.englishName)],
    ["caloriesPer100g", str(suggestion.caloriesPer100g)], ["proteinPer100g", str(suggestion.proteinPer100g)], ["carbsPer100g", str(suggestion.carbsPer100g)], ["fatPer100g", str(suggestion.fatPer100g)],
    ["shelfLifeDays", str(suggestion.shelfLifeDays)], ["price", str(suggestion.price)],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as IngredientAiValues;
}

export type RecipeAiValues = Partial<Record<"name" | "cuisine" | "servings" | "calories", string>>;
export function recipeValuesFrom(suggestion: RecipeSuggestion | null): RecipeAiValues {
  if (!suggestion) return {};
  const entries: Array<[keyof RecipeAiValues, string | undefined]> = [
    ["name", str(suggestion.name)], ["cuisine", str(suggestion.cuisine)], ["servings", str(suggestion.servings)], ["calories", str(suggestion.caloriesPerServing)],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as RecipeAiValues;
}

/** "Gợi ý AI" shows while the field still holds the AI's value (editing it removes the mark). */
export const isAiValue = <K extends string>(field: K, current: string, ai: Partial<Record<K, string>>): boolean =>
  ai[field] !== undefined && ai[field] === current;

/** Same normalization as admin-service's names (no accents, lower case, single spaces). */
export const nameKey = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().trim().replace(/\s+/g, " ");

/** An existing item with the same name (ignoring accents, case and spaces), other than the one being edited. */
export function findDuplicate<T extends { id: string; name: string }>(name: string, items: readonly T[], selfId?: string): T | null {
  const key = nameKey(name);
  if (!key) return null;
  return items.find((item) => item.id !== selfId && nameKey(item.name) === key) ?? null;
}

/** "Đã có 'Cà chua' trong danh mục" with "Mở món đó" / "Vẫn tạo mới" (the dialog's choose()). */
export const duplicateDialog = (existingName: string) => ({
  title: `Đã có "${existingName}" trong danh mục`,
  message: "Mở mục đã có để sửa, hoặc vẫn tạo mục mới trùng tên.",
  cancelLabel: "Mở món đó",
  confirmLabel: "Vẫn tạo mới",
});

/** Replacing an existing image asks first. */
export const replacePhotoDialog = (name: string) => ({ title: `Thay ảnh của ${name}?`, message: "Ảnh hiện tại sẽ được thay bằng ảnh vừa chọn.", confirmLabel: "Thay ảnh", destructive: true });

/** What the create step does after recognition: a prefilled form, or the empty form with the photo when AI is off / failed. */
export function recognitionOutcome(result: { status: number; error?: string } | null): { prefill: boolean; note: string | null } {
  if (!result) return { prefill: false, note: "Không nhận diện được ảnh. Hãy tự điền thông tin." };
  if (result.status === 200) return { prefill: true, note: null };
  if (result.error === "AI_LIMIT") return { prefill: false, note: "Đã dùng hết lượt nhận diện hôm nay. Hãy tự điền thông tin." };
  if (result.error === "AI_OFF") return { prefill: false, note: "Nhận diện ảnh đang tắt. Hãy tự điền thông tin." };
  return { prefill: false, note: "Không nhận diện được ảnh. Hãy tự điền thông tin." };
}

/** Confidence as a short note ("Độ tin cậy 80%"), or null. */
export const confidenceText = (confidence: number | null): string | null => (confidence === null ? null : `Độ tin cậy ${Math.round(confidence * 100)}%`);
