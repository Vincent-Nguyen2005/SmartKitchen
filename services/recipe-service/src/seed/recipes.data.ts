/**
 * Starter catalog: common Vietnamese home dishes. Quantities are for the whole recipe (`servings` people);
 * calories and macros are per serving (approximate home-cooking values). Units are the Kho / Giỏ hàng codes.
 * Only the main ingredients are listed (no salt, sugar, fish sauce or cooking oil), so "Có sẵn X/Y" stays meaningful.
 * The structured { name, quantity, unit } shape is the one from the older recipe schema (commit d8c7194).
 */
export type SeedUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export type SeedIngredient = { name: string; quantity: number; unit: SeedUnit };
export type SeedRecipe = {
  name: string;
  description: string;
  mealTypes: Array<"breakfast" | "lunch" | "dinner">;
  ingredients: SeedIngredient[];
  servings: number;
  preparationMinutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietaryTags?: string[];
  tags?: string[];
  allergens?: string[];
  contraindications?: string[];
};

const g = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "GRAM" });
const pc = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "PIECE" });
const ml = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "MILLILITER" });

export const seedRecipes: SeedRecipe[] = [
  // Bữa sáng
  {
    name: "Phở bò", description: "Bánh phở, thịt bò tái chín và nước dùng gừng hành.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Bánh phở", 400), g("Thịt bò", 250), pc("Hành tây", 1), g("Hành lá", 50), g("Gừng", 30)],
    servings: 2, preparationMinutes: 60, calories: 460, protein: 30, carbs: 60, fat: 10, tags: ["phổ biến"], allergens: [],
  },
  {
    name: "Bánh mì trứng ốp la", description: "Bánh mì giòn với trứng ốp la, dưa leo và cà chua.", mealTypes: ["breakfast"],
    ingredients: [pc("Bánh mì", 2), pc("Trứng gà", 4), pc("Dưa leo", 1), pc("Cà chua", 1)],
    servings: 2, preparationMinutes: 10, calories: 410, protein: 18, carbs: 45, fat: 17, tags: ["nhanh", "phổ biến"], allergens: ["trứng", "gluten"],
  },
  {
    name: "Xôi đậu xanh", description: "Xôi nếp dẻo với đậu xanh và hành phi.", mealTypes: ["breakfast"],
    ingredients: [g("Gạo nếp", 300), g("Đậu xanh", 100), g("Hành tím", 30)],
    servings: 3, preparationMinutes: 50, calories: 390, protein: 10, carbs: 74, fat: 6, dietaryTags: ["vegetarian"], contraindications: ["tiểu đường"],
  },
  {
    name: "Cháo gà", description: "Cháo gạo nấu với gà xé, gừng và hành lá.", mealTypes: ["breakfast", "dinner"],
    ingredients: [g("Gạo", 120), g("Thịt gà", 300), g("Gừng", 20), g("Hành lá", 30)],
    servings: 3, preparationMinutes: 45, calories: 320, protein: 23, carbs: 38, fat: 8,
  },
  {
    name: "Cháo yến mạch chuối sữa", description: "Yến mạch nấu sữa tươi, thêm chuối chín.", mealTypes: ["breakfast"],
    ingredients: [g("Yến mạch", 100), ml("Sữa tươi", 400), pc("Chuối", 2)],
    servings: 2, preparationMinutes: 10, calories: 330, protein: 12, carbs: 56, fat: 7, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["sữa", "gluten"],
  },
  {
    name: "Bún riêu cua", description: "Bún với riêu cua đồng, cà chua và đậu phụ chiên.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Bún", 400), g("Cua đồng", 300), pc("Cà chua", 3), pc("Đậu phụ", 2), pc("Trứng gà", 2)],
    servings: 3, preparationMinutes: 60, calories: 430, protein: 25, carbs: 55, fat: 12, allergens: ["hải sản", "trứng", "đậu nành"],
  },
  {
    name: "Hủ tiếu Nam Vang", description: "Hủ tiếu với thịt heo, tôm và giá đỗ.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Hủ tiếu", 400), g("Thịt heo", 200), g("Tôm", 200), g("Giá đỗ", 100)],
    servings: 3, preparationMinutes: 50, calories: 440, protein: 27, carbs: 56, fat: 11, allergens: ["hải sản"],
  },
  {
    name: "Bún bò Huế", description: "Bún bò cay thơm mùi sả, ăn kèm rau sống.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Bún", 400), g("Thịt bò", 300), g("Giò heo", 300), pc("Sả", 3)],
    servings: 3, preparationMinutes: 90, calories: 530, protein: 33, carbs: 58, fat: 17, contraindications: ["cao huyết áp"],
  },
  {
    name: "Bò kho", description: "Bò hầm sả, cà rốt, ăn với bánh mì hoặc bún.", mealTypes: ["breakfast", "dinner"],
    ingredients: [g("Thịt bò", 600), pc("Cà rốt", 2), pc("Sả", 3), pc("Bánh mì", 4)],
    servings: 4, preparationMinutes: 120, calories: 450, protein: 34, carbs: 30, fat: 21, allergens: ["gluten"],
  },
  // Bữa trưa / tối
  {
    name: "Thịt kho trứng", description: "Thịt ba chỉ kho nước dừa với trứng.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Thịt ba chỉ", 500), pc("Trứng gà", 4), ml("Nước dừa", 400)],
    servings: 4, preparationMinutes: 75, calories: 480, protein: 26, carbs: 8, fat: 38, tags: ["phổ biến"], allergens: ["trứng"], contraindications: ["mỡ máu cao"],
  },
  {
    name: "Cá kho tộ", description: "Cá kho tiêu hành, đậm đà ăn với cơm.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Cá basa", 500), g("Hành tím", 30), pc("Ớt", 2)],
    servings: 4, preparationMinutes: 45, calories: 260, protein: 24, carbs: 6, fat: 15, allergens: ["cá"],
  },
  {
    name: "Canh chua cá", description: "Canh chua miền Nam với cá, cà chua, dứa và giá.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Cá basa", 400), pc("Cà chua", 2), g("Dứa", 200), g("Giá đỗ", 100), g("Đậu bắp", 100)],
    servings: 4, preparationMinutes: 35, calories: 180, protein: 18, carbs: 14, fat: 6, allergens: ["cá"],
  },
  {
    name: "Rau muống xào tỏi", description: "Rau muống xào nhanh lửa với tỏi phi.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Rau muống", 500), g("Tỏi", 30)],
    servings: 4, preparationMinutes: 10, calories: 90, protein: 3, carbs: 8, fat: 6, dietaryTags: ["vegetarian"], tags: ["nhanh", "phổ biến"],
  },
  {
    name: "Canh bí đỏ thịt bằm", description: "Canh bí đỏ ngọt với thịt heo xay.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Bí đỏ", 500), g("Thịt heo xay", 200), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 25, calories: 150, protein: 11, carbs: 14, fat: 6,
  },
  {
    name: "Gà kho gừng", description: "Gà kho săn với gừng và hành tím.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Thịt gà", 600), g("Gừng", 50), g("Hành tím", 30)],
    servings: 4, preparationMinutes: 40, calories: 290, protein: 30, carbs: 5, fat: 17,
  },
  {
    name: "Đậu phụ sốt cà chua", description: "Đậu phụ chiên sốt cà chua và hành lá.", mealTypes: ["lunch", "dinner"],
    ingredients: [pc("Đậu phụ", 4), pc("Cà chua", 3), g("Hành lá", 20)],
    servings: 3, preparationMinutes: 20, calories: 220, protein: 14, carbs: 12, fat: 13, dietaryTags: ["vegetarian"], allergens: ["đậu nành"],
  },
  {
    name: "Trứng xào cà chua", description: "Trứng gà xào mềm với cà chua.", mealTypes: ["breakfast", "lunch", "dinner"],
    ingredients: [pc("Trứng gà", 4), pc("Cà chua", 3), g("Hành lá", 20)],
    servings: 3, preparationMinutes: 10, calories: 210, protein: 13, carbs: 8, fat: 14, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["trứng"],
  },
  {
    name: "Bò xào bông cải xanh", description: "Thịt bò mềm xào bông cải xanh và cà rốt.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Thịt bò", 300), g("Bông cải xanh", 400), pc("Cà rốt", 1), g("Tỏi", 20)],
    servings: 3, preparationMinutes: 20, calories: 280, protein: 26, carbs: 12, fat: 14,
  },
  {
    name: "Canh rau ngót thịt bằm", description: "Canh rau ngót thanh mát với thịt heo xay.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Rau ngót", 300), g("Thịt heo xay", 150)],
    servings: 4, preparationMinutes: 15, calories: 120, protein: 10, carbs: 5, fat: 6, tags: ["nhanh"],
  },
  {
    name: "Sườn xào chua ngọt", description: "Sườn heo rim sốt chua ngọt cà chua, dứa.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Sườn heo", 600), pc("Cà chua", 2), g("Dứa", 200), pc("Hành tây", 1)],
    servings: 4, preparationMinutes: 45, calories: 420, protein: 26, carbs: 18, fat: 27, contraindications: ["tiểu đường"],
  },
  {
    name: "Tôm rim", description: "Tôm rim mặn ngọt với tỏi và hành lá.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Tôm", 500), g("Tỏi", 20), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 25, calories: 180, protein: 24, carbs: 5, fat: 7, allergens: ["hải sản"],
  },
  {
    name: "Cơm chiên dương châu", description: "Cơm chiên trứng, lạp xưởng, đậu Hà Lan và cà rốt.", mealTypes: ["lunch"],
    ingredients: [g("Gạo", 400), pc("Trứng gà", 3), pc("Lạp xưởng", 2), g("Đậu Hà Lan", 100), pc("Cà rốt", 1)],
    servings: 3, preparationMinutes: 25, calories: 520, protein: 18, carbs: 70, fat: 18, allergens: ["trứng"],
  },
  {
    name: "Bún chả", description: "Chả thịt heo nướng, bún và rau sống, chấm nước mắm chua ngọt.", mealTypes: ["lunch"],
    ingredients: [g("Bún", 500), g("Thịt heo xay", 300), g("Thịt ba chỉ", 200), g("Rau sống", 200)],
    servings: 3, preparationMinutes: 50, calories: 580, protein: 30, carbs: 62, fat: 22, tags: ["phổ biến"],
  },
  {
    name: "Gỏi cuốn tôm thịt", description: "Bánh tráng cuốn tôm, thịt, bún và rau xà lách.", mealTypes: ["lunch", "dinner"],
    ingredients: [{ name: "Bánh tráng", quantity: 1, unit: "PACK" }, g("Tôm", 200), g("Thịt ba chỉ", 200), g("Bún", 200), g("Xà lách", 150)],
    servings: 4, preparationMinutes: 40, calories: 300, protein: 18, carbs: 35, fat: 9, allergens: ["hải sản"],
  },
  {
    name: "Mực xào cần tây", description: "Mực tươi xào cần tây và hành tây.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Mực", 400), g("Cần tây", 200), pc("Hành tây", 1)],
    servings: 3, preparationMinutes: 20, calories: 200, protein: 24, carbs: 8, fat: 7, allergens: ["hải sản"],
  },
  {
    name: "Canh khổ qua nhồi thịt", description: "Khổ qua nhồi thịt heo xay và nấm mèo.", mealTypes: ["lunch", "dinner"],
    ingredients: [pc("Khổ qua", 3), g("Thịt heo xay", 300), g("Nấm mèo", 20)],
    servings: 4, preparationMinutes: 45, calories: 210, protein: 15, carbs: 8, fat: 13,
  },
];

/** Plain ingredient names (the older `ingredients` column) for a seed recipe. */
export const ingredientNames = (recipe: SeedRecipe): string[] => recipe.ingredients.map((ingredient) => ingredient.name);
