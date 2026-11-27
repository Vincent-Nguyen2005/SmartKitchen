/**
 * Recipe editor, ingredients used in one step (pure; covered by stepIngredients.test.ts). The step shows only its own
 * ingredients as tags ("Tôm ✕"); "+ Thêm nguyên liệu" offers the recipe's ingredients not attached to it yet. The saved
 * data is unchanged: the step's list of ingredient names (in the order they were added).
 */
const key = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").trim().toLocaleLowerCase("vi");

/** The recipe's ingredient names (trimmed, non-empty, each once, in recipe order). */
export const recipeIngredientNames = (rows: Array<{ name: string }>): string[] => [...new Set(rows.map((row) => row.name.trim()).filter(Boolean))];

/** Tags of the step: its names that are still in the recipe (a renamed / removed ingredient no longer shows). */
export const stepTags = (stepIngredients: string[], recipeNames: string[]): string[] => stepIngredients.filter((name) => recipeNames.includes(name));

/** Picker options: recipe ingredients not attached to the step yet, filtered by the search text (no accents needed). */
export function pickerOptions(recipeNames: string[], stepIngredients: string[], search = ""): string[] {
  const term = key(search);
  return recipeNames.filter((name) => !stepIngredients.includes(name) && (!term || key(name).includes(term)));
}

export const addStepIngredient = (stepIngredients: string[], name: string): string[] => (stepIngredients.includes(name) ? stepIngredients : [...stepIngredients, name]);
export const removeStepIngredient = (stepIngredients: string[], name: string): string[] => stepIngredients.filter((entry) => entry !== name);
