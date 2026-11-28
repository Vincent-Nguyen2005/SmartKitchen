/**
 * Starter catalog: common Vietnamese home dishes. Quantities are for the whole recipe (`servings` people);
 * calories and macros are per serving (approximate home-cooking values). Units are the Kho / Giỏ hàng codes.
 * Only the main ingredients are listed (no salt, sugar, fish sauce or cooking oil), so "Có sẵn X/Y" stays meaningful.
 * The structured { name, quantity, unit } shape is the one from the older recipe schema (commit d8c7194).
 */
export type SeedUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export type SeedIngredient = { name: string; quantity: number; unit: SeedUnit };
/** Role in a Vietnamese family meal (see recipe-service README). */
export type SeedRole = "man" | "xao" | "canh" | "rau" | "khai_vi" | "trang_mieng" | "sang" | "mot_mon" | "do_uong";
/** Internal cuisine; not set = vietnam. */
export type SeedCuisine = "vietnam" | "western" | "asian";
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
  role?: SeedRole;
  cuisine?: SeedCuisine;
};

const g = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "GRAM" });
const pc = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "PIECE" });
const ml = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "MILLILITER" });
const box = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "BOX" });
const pack = (name: string, quantity: number): SeedIngredient => ({ name, quantity, unit: "PACK" });

export const seedRecipes: SeedRecipe[] = [
  // Bữa sáng
  {
    name: "Phở bò", description: "Bánh phở, thịt bò tái chín và nước dùng gừng hành.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Bánh phở", 400), g("Thịt bò", 250), g("Xương bò", 1000), pc("Hành tây", 1), g("Hành lá", 50), g("Gừng", 30)],
    servings: 2, preparationMinutes: 200, calories: 500, protein: 32, carbs: 60, fat: 13, tags: ["phổ biến"], allergens: [],
  },
  {
    name: "Bánh mì trứng ốp la", description: "Bánh mì giòn với trứng ốp la, dưa leo và cà chua.", mealTypes: ["breakfast"],
    ingredients: [pc("Bánh mì", 2), pc("Trứng gà", 4), pc("Dưa leo", 1), pc("Cà chua", 1)],
    servings: 2, preparationMinutes: 10, calories: 410, protein: 18, carbs: 45, fat: 17, tags: ["nhanh", "phổ biến"], allergens: ["trứng", "gluten", "đậu nành"],
  },
  {
    name: "Xôi đậu xanh", description: "Xôi nếp dẻo với đậu xanh và hành phi.", mealTypes: ["breakfast"],
    ingredients: [g("Gạo nếp", 300), g("Đậu xanh", 100), g("Hành tím", 30)],
    servings: 3, preparationMinutes: 50, calories: 560, protein: 15, carbs: 105, fat: 9, dietaryTags: ["vegetarian"], contraindications: ["Tiểu đường"],
  },
  {
    name: "Cháo gà", description: "Cháo gạo nấu với gà xé, gừng và hành lá.", mealTypes: ["breakfast", "dinner"],
    ingredients: [g("Gạo", 120), g("Thịt gà", 300), g("Gừng", 20), g("Hành lá", 30)],
    servings: 3, preparationMinutes: 55, calories: 320, protein: 23, carbs: 38, fat: 8,
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
    ingredients: [g("Hủ tiếu", 400), g("Thịt heo", 200), g("Tôm", 200), g("Xương heo", 500), g("Giá đỗ", 100)],
    servings: 3, preparationMinutes: 110, calories: 460, protein: 28, carbs: 56, fat: 13, allergens: ["hải sản"],
  },
  {
    name: "Bún bò Huế", description: "Bún bò cay thơm mùi sả, ăn kèm rau sống.", mealTypes: ["breakfast", "lunch"],
    ingredients: [g("Bún", 400), g("Thịt bò", 300), g("Giò heo", 300), pc("Sả", 3)],
    servings: 3, preparationMinutes: 90, calories: 600, protein: 38, carbs: 58, fat: 24, allergens: ["hải sản"], contraindications: ["Cao huyết áp"],
  },
  {
    name: "Bò kho", description: "Bò hầm sả, cà rốt, ăn với bánh mì hoặc bún.", mealTypes: ["breakfast", "dinner"],
    ingredients: [g("Thịt bò", 600), pc("Cà rốt", 2), pc("Sả", 3), g("Tỏi", 10), g("Hành tím", 20), pc("Bánh mì", 4)],
    servings: 4, preparationMinutes: 120, calories: 690, protein: 46, carbs: 49, fat: 35, allergens: ["gluten"],
  },
  // Bữa trưa / tối
  {
    name: "Thịt kho trứng", description: "Thịt ba chỉ kho nước dừa với trứng.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Thịt ba chỉ", 500), pc("Trứng gà", 4), ml("Nước dừa", 400)],
    servings: 4, preparationMinutes: 75, calories: 680, protein: 18, carbs: 7, fat: 64, tags: ["phổ biến"], allergens: ["trứng"], contraindications: ["Mỡ máu cao", "Cao huyết áp"],
  },
  {
    name: "Cá kho tộ", description: "Cá kho tiêu hành, đậm đà ăn với cơm.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Cá basa", 500), g("Hành tím", 30), pc("Ớt", 2)],
    servings: 4, preparationMinutes: 45, calories: 200, protein: 24, carbs: 6, fat: 9, allergens: ["cá"],
  },
  {
    name: "Canh chua cá", description: "Canh chua miền Nam với cá, cà chua, dứa và giá.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Cá basa", 400), pc("Cà chua", 2), g("Dứa", 200), g("Giá đỗ", 100), g("Đậu bắp", 100), g("Rau thơm", 20)],
    servings: 4, preparationMinutes: 35, calories: 180, protein: 18, carbs: 14, fat: 6, allergens: ["cá"],
  },
  {
    name: "Rau muống xào tỏi", description: "Rau muống xào nhanh lửa với tỏi phi.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Rau muống", 500), g("Tỏi", 30)],
    servings: 4, preparationMinutes: 10, calories: 95, protein: 3, carbs: 8, fat: 6, dietaryTags: ["vegetarian"], tags: ["nhanh", "phổ biến"],
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
    servings: 3, preparationMinutes: 10, calories: 190, protein: 13, carbs: 5, fat: 13, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["trứng"],
  },
  {
    name: "Bò xào bông cải xanh", description: "Thịt bò mềm xào bông cải xanh và cà rốt.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Thịt bò", 300), g("Bông cải xanh", 400), pc("Cà rốt", 1), g("Tỏi", 20)],
    servings: 3, preparationMinutes: 20, calories: 280, protein: 26, carbs: 12, fat: 14,
  },
  {
    name: "Canh rau ngót thịt bằm", description: "Canh rau ngót thanh mát với thịt heo xay.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Rau ngót", 300), g("Thịt heo xay", 150)],
    servings: 4, preparationMinutes: 15, calories: 120, protein: 10, carbs: 6, fat: 6, tags: ["nhanh"],
  },
  {
    name: "Sườn xào chua ngọt", description: "Sườn heo rim sốt chua ngọt cà chua, dứa.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Sườn heo", 600), pc("Cà chua", 2), g("Dứa", 200), pc("Hành tây", 1)],
    servings: 4, preparationMinutes: 45, calories: 420, protein: 26, carbs: 18, fat: 27, contraindications: ["Tiểu đường"],
  },
  {
    name: "Tôm rim", description: "Tôm rim mặn ngọt với tỏi và hành lá.", mealTypes: ["lunch", "dinner"],
    ingredients: [g("Tôm", 500), g("Tỏi", 20), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 25, calories: 180, protein: 24, carbs: 5, fat: 7, allergens: ["hải sản"],
  },
  {
    name: "Cơm chiên dương châu", description: "Cơm chiên trứng, lạp xưởng, đậu Hà Lan và cà rốt.", mealTypes: ["lunch"],
    ingredients: [g("Gạo", 300), pc("Trứng gà", 3), pc("Lạp xưởng", 2), g("Đậu Hà Lan", 100), pc("Cà rốt", 1)],
    servings: 3, preparationMinutes: 25, calories: 660, protein: 19, carbs: 89, fat: 25, allergens: ["trứng", "đậu nành", "gluten"],
  },
  {
    name: "Bún chả", description: "Chả thịt heo nướng, bún, xà lách và rau thơm, chấm nước mắm chua ngọt.", mealTypes: ["lunch"],
    ingredients: [g("Bún", 500), g("Thịt heo xay", 300), g("Thịt ba chỉ", 200), g("Xà lách", 130), g("Rau thơm", 70)],
    servings: 3, preparationMinutes: 50, calories: 740, protein: 26, carbs: 53, fat: 47, tags: ["phổ biến"], contraindications: ["Mỡ máu cao", "Cao huyết áp"],
  },
  {
    name: "Gỏi cuốn tôm thịt", description: "Bánh tráng cuốn tôm, thịt, bún và rau xà lách.", mealTypes: ["lunch", "dinner"],
    ingredients: [pc("Bánh tráng", 12), g("Tôm", 200), g("Thịt ba chỉ", 200), g("Bún", 200), g("Xà lách", 150), g("Rau thơm", 50)],
    servings: 4, preparationMinutes: 40, calories: 450, protein: 19, carbs: 42, fat: 23, allergens: ["hải sản", "đậu nành", "gluten"],
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

  // Thêm món (Bữa sáng, đồ uống, món mặn / xào / canh / rau / tráng miệng)
  {
    name: "Xôi gà", description: "Xôi nếp dẻo với gà xé và hành phi.", mealTypes: ["breakfast"], role: "sang",
    ingredients: [g("Gạo nếp", 300), g("Thịt gà", 300), g("Hành tím", 30)],
    servings: 3, preparationMinutes: 50, calories: 590, protein: 20, carbs: 82, fat: 20, contraindications: ["Tiểu đường"],
  },
  {
    name: "Cháo thịt bằm", description: "Cháo trắng nấu với thịt heo xay, rắc hành lá.", mealTypes: ["breakfast"], role: "sang",
    ingredients: [g("Gạo", 100), g("Thịt heo xay", 200), g("Hành lá", 20)],
    servings: 3, preparationMinutes: 45, calories: 300, protein: 16, carbs: 36, fat: 10,
  },
  {
    name: "Bánh mì chảo", description: "Trứng ốp la, xúc xích và pa tê trên chảo nóng, ăn kèm bánh mì.", mealTypes: ["breakfast"], role: "sang",
    ingredients: [pc("Bánh mì", 2), pc("Trứng gà", 2), pc("Xúc xích", 2), g("Pa tê", 100)],
    servings: 2, preparationMinutes: 20, calories: 520, protein: 22, carbs: 48, fat: 26, allergens: ["trứng", "gluten", "đậu nành"],
  },
  {
    name: "Mì xào trứng", description: "Mì xào nhanh với trứng và cải ngọt.", mealTypes: ["breakfast"], role: "sang",
    ingredients: [pack("Mì gói", 2), pc("Trứng gà", 2), g("Cải ngọt", 150)],
    servings: 2, preparationMinutes: 15, calories: 450, protein: 15, carbs: 55, fat: 19, tags: ["nhanh"], allergens: ["trứng", "gluten", "đậu nành"], contraindications: ["Cao huyết áp"],
  },
  {
    name: "Sữa đậu nành", description: "Sữa đậu nành nấu tại nhà, uống nóng hoặc lạnh.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [g("Đậu nành", 150)],
    servings: 4, preparationMinutes: 40, calories: 130, protein: 8, carbs: 12, fat: 5, dietaryTags: ["vegetarian"], allergens: ["đậu nành"],
  },
  {
    name: "Nước cam", description: "Nước cam vắt tươi.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [pc("Cam", 4)],
    servings: 2, preparationMinutes: 5, calories: 110, protein: 2, carbs: 26, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"],
  },
  {
    name: "Sinh tố chuối", description: "Chuối xay với sữa tươi.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [pc("Chuối", 2), ml("Sữa tươi", 300)],
    servings: 2, preparationMinutes: 5, calories: 200, protein: 6, carbs: 34, fat: 4, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["sữa"],
  },
  {
    name: "Cá chiên giòn", description: "Cá basa tẩm bột chiên vàng giòn.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Cá basa", 500), g("Bột chiên giòn", 100)],
    servings: 4, preparationMinutes: 25, calories: 280, protein: 24, carbs: 12, fat: 15, allergens: ["cá", "gluten"],
  },
  {
    name: "Thịt ba chỉ luộc", description: "Thịt ba chỉ luộc gừng, chấm mắm tỏi ớt.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Thịt ba chỉ", 500), g("Gừng", 20)],
    servings: 4, preparationMinutes: 35, calories: 560, protein: 12, carbs: 1, fat: 56, contraindications: ["Mỡ máu cao"],
  },
  {
    name: "Đậu hũ nhồi thịt", description: "Đậu phụ nhồi thịt heo xay sốt cà chua.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [pc("Đậu phụ", 4), g("Thịt heo xay", 200), pc("Cà chua", 2)],
    servings: 4, preparationMinutes: 35, calories: 260, protein: 18, carbs: 8, fat: 17, allergens: ["đậu nành"],
  },
  {
    name: "Đậu cô ve xào thịt bò", description: "Đậu cô ve giòn xào thịt bò và tỏi.", mealTypes: ["lunch", "dinner"], role: "xao",
    ingredients: [g("Đậu que", 300), g("Thịt bò", 200), g("Tỏi", 20)],
    servings: 3, preparationMinutes: 20, calories: 230, protein: 20, carbs: 10, fat: 12,
  },
  {
    name: "Cải thìa xào nấm", description: "Cải thìa xào nấm hương với tỏi.", mealTypes: ["lunch", "dinner"], role: "xao",
    ingredients: [g("Cải thìa", 400), g("Nấm hương", 100), g("Tỏi", 20)],
    servings: 3, preparationMinutes: 15, calories: 110, protein: 5, carbs: 10, fat: 6, dietaryTags: ["vegetarian"],
  },
  {
    name: "Canh cải thịt bằm", description: "Canh cải xanh nấu thịt heo xay.", mealTypes: ["lunch", "dinner"], role: "canh",
    ingredients: [g("Cải xanh", 300), g("Thịt heo xay", 150)],
    servings: 4, preparationMinutes: 20, calories: 120, protein: 10, carbs: 6, fat: 6,
  },
  {
    name: "Canh trứng cà chua", description: "Canh cà chua với trứng đánh tan và hành lá.", mealTypes: ["lunch", "dinner"], role: "canh",
    ingredients: [pc("Trứng gà", 2), pc("Cà chua", 2), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 15, calories: 90, protein: 6, carbs: 5, fat: 5, tags: ["nhanh"], allergens: ["trứng"],
  },
  {
    name: "Rau muống luộc", description: "Rau muống luộc xanh, chấm nước mắm hoặc tương.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Rau muống", 500)],
    servings: 4, preparationMinutes: 10, calories: 25, protein: 3, carbs: 3, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"],
  },
  {
    name: "Bắp cải luộc", description: "Bắp cải luộc ngọt, chấm nước mắm.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Bắp cải", 500)],
    servings: 4, preparationMinutes: 15, calories: 35, protein: 2, carbs: 7, fat: 0, dietaryTags: ["vegetarian"],
  },
  {
    name: "Đậu bắp luộc", description: "Đậu bắp luộc vừa chín, chấm kho quẹt hoặc nước mắm.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Đậu bắp", 300)],
    servings: 3, preparationMinutes: 10, calories: 36, protein: 2, carbs: 7, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"],
  },
  {
    name: "Chuối tráng miệng", description: "Chuối chín ăn sau bữa.", mealTypes: ["lunch", "dinner"], role: "trang_mieng",
    ingredients: [pc("Chuối", 4)],
    servings: 4, preparationMinutes: 2, calories: 105, protein: 1, carbs: 25, fat: 0, dietaryTags: ["vegetarian"],
  },
  {
    name: "Dưa hấu", description: "Dưa hấu ướp lạnh cắt miếng.", mealTypes: ["lunch", "dinner"], role: "trang_mieng",
    ingredients: [g("Dưa hấu", 1000)],
    servings: 4, preparationMinutes: 5, calories: 80, protein: 2, carbs: 18, fat: 0, dietaryTags: ["vegetarian"],
  },
  {
    name: "Chè đậu xanh", description: "Chè đậu xanh nước cốt dừa.", mealTypes: ["lunch", "dinner"], role: "trang_mieng",
    ingredients: [g("Đậu xanh", 150), ml("Nước cốt dừa", 200)],
    servings: 4, preparationMinutes: 45, calories: 250, protein: 7, carbs: 38, fat: 8, dietaryTags: ["vegetarian"], contraindications: ["Tiểu đường"],
  },
  {
    name: "Sữa chua", description: "Sữa chua ăn lạnh sau bữa.", mealTypes: ["lunch", "dinner"], role: "trang_mieng",
    ingredients: [box("Sữa chua", 4)],
    servings: 4, preparationMinutes: 1, calories: 100, protein: 4, carbs: 14, fat: 3, dietaryTags: ["vegetarian"], allergens: ["sữa"],
  },
  {
    name: "Cam tráng miệng", description: "Cam bổ múi ăn sau bữa.", mealTypes: ["lunch", "dinner"], role: "trang_mieng",
    ingredients: [pc("Cam", 4)],
    servings: 4, preparationMinutes: 3, calories: 60, protein: 1, carbs: 14, fat: 0, dietaryTags: ["vegetarian"],
  },
  // Thêm món (rau luộc, đồ uống, món một tô): fills the thin roles. Tags are explicit (catalog names).
  {
    name: "Su su luộc", description: "Su su luộc mềm ngọt, chấm muối mè hoặc nước mắm.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Su su", 500)],
    servings: 4, preparationMinutes: 15, calories: 25, protein: 1, carbs: 5, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Cải ngọt luộc", description: "Cải ngọt luộc xanh, chấm nước mắm.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Cải ngọt", 500)],
    servings: 4, preparationMinutes: 10, calories: 22, protein: 2, carbs: 3, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Rau lang luộc", description: "Rau lang luộc, chấm nước mắm tỏi.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Rau lang", 500)],
    servings: 4, preparationMinutes: 10, calories: 45, protein: 3, carbs: 8, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Bông cải xanh luộc", description: "Bông cải xanh luộc vừa chín, giữ màu xanh.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Bông cải xanh", 500)],
    servings: 4, preparationMinutes: 10, calories: 45, protein: 3, carbs: 8, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Đậu que luộc", description: "Đậu que luộc giòn, chấm nước mắm.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [g("Đậu que", 400)],
    servings: 4, preparationMinutes: 10, calories: 32, protein: 2, carbs: 6, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Dưa leo chấm muối", description: "Dưa leo giòn chấm muối ớt chanh.", mealTypes: ["lunch", "dinner"], role: "rau",
    ingredients: [pc("Dưa leo", 3)],
    servings: 4, preparationMinutes: 5, calories: 20, protein: 1, carbs: 4, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Sữa tươi nóng", description: "Sữa tươi hâm nóng, uống buổi sáng.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [ml("Sữa tươi", 400)],
    servings: 2, preparationMinutes: 5, calories: 125, protein: 6, carbs: 10, fat: 7, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["sữa"], contraindications: [],
  },
  {
    name: "Nước chanh", description: "Nước chanh đường mát lạnh.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [pc("Chanh", 2)],
    servings: 2, preparationMinutes: 5, calories: 55, protein: 0, carbs: 14, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: ["Tiểu đường"],
  },
  {
    name: "Trà xanh nóng", description: "Trà xanh hãm nóng, không đường.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [g("Trà xanh", 10)],
    servings: 2, preparationMinutes: 5, calories: 2, protein: 0, carbs: 0, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Sinh tố bơ", description: "Quả bơ xay với sữa tươi và sữa đặc.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [pc("Quả bơ", 1), ml("Sữa tươi", 200), g("Sữa đặc", 40)],
    servings: 2, preparationMinutes: 5, calories: 300, protein: 7, carbs: 24, fat: 19, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["sữa"], contraindications: ["Tiểu đường"],
  },
  {
    name: "Nước ép dưa hấu", description: "Dưa hấu ép tươi, không thêm đường.", mealTypes: ["breakfast"], role: "do_uong",
    ingredients: [g("Dưa hấu", 800)],
    servings: 2, preparationMinutes: 5, calories: 120, protein: 2, carbs: 28, fat: 0, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: [], contraindications: [],
  },
  {
    name: "Bánh canh cua", description: "Bánh canh sợi dai với thịt cua, tôm và nước dùng xương.", mealTypes: ["breakfast", "lunch"], role: "mot_mon",
    ingredients: [g("Bánh canh", 600), g("Thịt cua", 200), g("Tôm", 150), g("Xương heo", 500), g("Hành tím", 20), g("Hành lá", 30)],
    servings: 3, preparationMinutes: 110, calories: 480, protein: 30, carbs: 70, fat: 9, allergens: ["hải sản"], contraindications: ["Gout"],
  },
  {
    name: "Mì Quảng", description: "Mì Quảng với thịt heo, tôm, lạc rang, xà lách, giá đỗ và rau thơm.", mealTypes: ["breakfast", "lunch"], role: "mot_mon",
    ingredients: [g("Mì Quảng", 600), g("Thịt heo", 200), g("Tôm", 200), g("Lạc", 30), g("Hành tím", 20), g("Xà lách", 80), g("Giá đỗ", 70), g("Rau thơm", 50)],
    servings: 3, preparationMinutes: 50, calories: 600, protein: 33, carbs: 67, fat: 22, allergens: ["hải sản", "đậu phộng"], contraindications: ["Gout"],
  },
  {
    name: "Bánh cuốn", description: "Bánh cuốn nhân thịt heo và nấm mèo, ăn kèm chả lụa và nước mắm chua ngọt.", mealTypes: ["breakfast", "lunch"], role: "mot_mon",
    ingredients: [g("Bánh cuốn", 450), g("Thịt heo xay", 200), g("Nấm mèo", 20), g("Hành tím", 20), g("Chả lụa", 100)],
    servings: 3, preparationMinutes: 40, calories: 530, protein: 20, carbs: 53, fat: 25, allergens: [], contraindications: ["Cao huyết áp"],
  },
  {
    name: "Bún mọc", description: "Bún với mọc giò sống, nấm hương và nước dùng xương.", mealTypes: ["breakfast", "lunch"], role: "mot_mon",
    ingredients: [g("Bún", 450), g("Giò sống", 300), g("Xương heo", 500), g("Nấm hương", 50), g("Hành tím", 20), g("Hành lá", 30)],
    servings: 3, preparationMinutes: 110, calories: 400, protein: 23, carbs: 40, fat: 16, allergens: [], contraindications: ["Gout"],
  },
  // Món nước ngoài quen thuộc với gia đình Việt (cuisine western / asian; menus mix in at most 1 per meal, 2 per day).
  {
    name: "Mì Ý sốt bò bằm", description: "Mì Ý với sốt cà chua thịt bò băm, rắc phô mai.", mealTypes: ["breakfast", "lunch"], role: "mot_mon", cuisine: "western",
    ingredients: [g("Mì Ý", 250), g("Thịt bò", 250), pc("Cà chua", 3), g("Sốt cà chua", 200), pc("Hành tây", 1), g("Tỏi", 10), g("Phô mai", 30)],
    servings: 3, preparationMinutes: 45, calories: 710, protein: 38, carbs: 78, fat: 27, allergens: ["gluten", "sữa"], contraindications: [],
  },
  {
    name: "Cà ri gà kiểu Nhật", description: "Gà hầm khoai tây, cà rốt trong sốt cà ri sánh, ăn với cơm.", mealTypes: ["lunch", "dinner"], role: "mot_mon", cuisine: "asian",
    // A one-plate curry rice: its rice is part of the dish (75 g raw per serving, +245 kcal, +58 g carbs).
    ingredients: [g("Thịt gà", 600), pc("Khoai tây", 2), pc("Cà rốt", 1), pc("Hành tây", 1), g("Bột cà ri", 20), g("Bột mì", 30), g("Bơ lạt", 20), g("Gạo", 300)],
    servings: 4, preparationMinutes: 60, calories: 655, protein: 22, carbs: 86, fat: 23, allergens: ["gluten", "sữa"], contraindications: [],
  },
  {
    name: "Kimbap", description: "Cơm cuộn rong biển với trứng, cà rốt, dưa leo và xúc xích.", mealTypes: ["breakfast", "lunch"], role: "sang", cuisine: "asian",
    ingredients: [g("Gạo", 300), g("Rong biển", 12), pc("Trứng gà", 2), pc("Cà rốt", 1), pc("Dưa leo", 1), pc("Xúc xích", 2), g("Mè", 10)],
    servings: 3, preparationMinutes: 60, calories: 590, protein: 17, carbs: 84, fat: 20, allergens: ["trứng", "mè"], contraindications: ["Cao huyết áp", "Mỡ máu cao"],
  },
  {
    name: "Cá hồi áp chảo", description: "Cá hồi áp chảo bơ tỏi, ăn kèm bông cải xanh.", mealTypes: ["lunch", "dinner"], role: "mot_mon", cuisine: "western",
    ingredients: [g("Cá hồi", 300), g("Bơ lạt", 20), g("Tỏi", 10), pc("Chanh", 1), g("Bông cải xanh", 200)],
    servings: 2, preparationMinutes: 25, calories: 480, protein: 33, carbs: 9, fat: 34, allergens: ["cá", "sữa"], contraindications: [],
  },
  {
    name: "Súp bí đỏ kem", description: "Súp bí đỏ xay mịn với sữa và kem tươi.", mealTypes: ["lunch", "dinner"], role: "canh", cuisine: "western",
    ingredients: [g("Bí đỏ", 600), pc("Hành tây", 1), g("Bơ lạt", 20), ml("Sữa tươi", 200), ml("Kem tươi", 100)],
    servings: 4, preparationMinutes: 35, calories: 210, protein: 4, carbs: 16, fat: 15, dietaryTags: ["vegetarian"], allergens: ["sữa"], contraindications: [],
  },
  {
    name: "Salad trộn dầu giấm", description: "Xà lách, cà chua, dưa leo và trứng trộn dầu giấm.", mealTypes: ["lunch", "dinner"], role: "rau", cuisine: "western",
    ingredients: [g("Xà lách", 300), pc("Cà chua", 2), pc("Dưa leo", 1), g("Hành tây", 50), pc("Trứng gà", 2)],
    servings: 4, preparationMinutes: 20, calories: 125, protein: 4, carbs: 6, fat: 9, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["trứng"], contraindications: [],
  },
  {
    name: "Trứng cuộn kiểu Hàn", description: "Trứng cuộn nhiều lớp với cà rốt và hành lá.", mealTypes: ["lunch", "dinner"], role: "khai_vi", cuisine: "asian",
    ingredients: [pc("Trứng gà", 6), g("Cà rốt", 50), g("Hành lá", 20)],
    servings: 3, preparationMinutes: 15, calories: 190, protein: 13, carbs: 3, fat: 14, dietaryTags: ["vegetarian"], tags: ["nhanh"], allergens: ["trứng"], contraindications: [],
  },
  {
    name: "Bánh mì sandwich trứng", description: "Bánh mì sandwich nướng kẹp trứng, phô mai, xà lách và cà chua.", mealTypes: ["breakfast"], role: "sang", cuisine: "western",
    ingredients: [pc("Bánh mì sandwich", 4), pc("Trứng gà", 2), g("Xà lách", 30), pc("Cà chua", 1), g("Phô mai", 30)],
    servings: 2, preparationMinutes: 10, calories: 320, protein: 16, carbs: 32, fat: 14, tags: ["nhanh"], allergens: ["gluten", "trứng", "sữa"], contraindications: [],
  },
  {
    name: "Gà sốt cay kiểu Hàn", description: "Đùi gà áp chảo rim sốt tương ớt Hàn, rắc mè.", mealTypes: ["lunch", "dinner"], role: "man", cuisine: "asian",
    ingredients: [g("Đùi gà", 800), g("Tương ớt Hàn", 40), g("Tỏi", 15), g("Mè", 5), g("Hành lá", 10)],
    servings: 4, preparationMinutes: 50, calories: 400, protein: 26, carbs: 10, fat: 28, allergens: ["đậu nành", "gluten", "mè"], contraindications: [],
  },
  {
    name: "Canh kim chi đậu phụ", description: "Canh kim chi chua cay với đậu phụ và thịt ba chỉ.", mealTypes: ["lunch", "dinner"], role: "canh", cuisine: "asian",
    ingredients: [g("Kim chi", 300), pc("Đậu phụ", 2), g("Thịt ba chỉ", 100), g("Hành lá", 20), g("Tương ớt Hàn", 15)],
    servings: 4, preparationMinutes: 25, calories: 190, protein: 10, carbs: 5, fat: 14, allergens: ["đậu nành", "gluten"], contraindications: ["Mỡ máu cao"],
  },
  {
    name: "Cơm chiên kim chi", description: "Cơm chiên kim chi với thịt xông khói, trứng ốp la.", mealTypes: ["breakfast", "lunch"], role: "mot_mon", cuisine: "asian",
    ingredients: [g("Gạo", 300), g("Kim chi", 200), pc("Trứng gà", 3), g("Thịt xông khói", 100), g("Hành lá", 20)],
    servings: 3, preparationMinutes: 25, calories: 670, protein: 18, carbs: 82, fat: 29, allergens: ["trứng", "đậu nành", "gluten", "mè"], contraindications: ["Cao huyết áp", "Mỡ máu cao"],
  },
  {
    name: "Bò bít tết", description: "Thịt bò áp chảo bơ tỏi, ăn kèm khoai tây và salad.", mealTypes: ["lunch", "dinner"], role: "mot_mon", cuisine: "western",
    ingredients: [g("Thịt bò", 400), pc("Khoai tây", 1), g("Bơ lạt", 20), g("Tỏi", 10), g("Xà lách", 50), pc("Cà chua", 1)],
    servings: 2, preparationMinutes: 40, calories: 600, protein: 53, carbs: 18, fat: 35, allergens: ["sữa"], contraindications: [],
  },
  {
    name: "Khoai tây nghiền", description: "Khoai tây nghiền mịn với bơ và sữa, món ăn kèm.", mealTypes: ["lunch", "dinner"], role: "rau", cuisine: "western",
    ingredients: [pc("Khoai tây", 4), g("Bơ lạt", 30), ml("Sữa tươi", 150)],
    servings: 4, preparationMinutes: 30, calories: 195, protein: 4, carbs: 28, fat: 7, dietaryTags: ["vegetarian"], allergens: ["sữa"], contraindications: [],
  },
  {
    name: "Súp nấm kem", description: "Súp nấm mỡ nấu sữa và kem tươi.", mealTypes: ["lunch", "dinner"], role: "canh", cuisine: "western",
    ingredients: [g("Nấm mỡ", 300), pc("Hành tây", 1), g("Bơ lạt", 20), g("Bột mì", 20), ml("Sữa tươi", 300), ml("Kem tươi", 100)],
    servings: 4, preparationMinutes: 30, calories: 215, protein: 6, carbs: 13, fat: 15, dietaryTags: ["vegetarian"], allergens: ["sữa", "gluten"], contraindications: [],
  },
  // 2026-12: 8 common Vietnamese món mặn (data fix 2026-12-more-mon-man.js adds them to existing databases).
  {
    name: "Cá basa kho tiêu", description: "Cá basa kho tiêu với hành tím, nước kho sệt, ăn với cơm.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Cá basa", 600), g("Hành tím", 30), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 40, calories: 220, protein: 22, carbs: 4, fat: 13, allergens: ["cá"], contraindications: ["Cao huyết áp"],
  },
  {
    name: "Gà chiên nước mắm", description: "Đùi gà chiên vàng giòn, áo sốt nước mắm tỏi.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Đùi gà", 800), g("Tỏi", 20)],
    servings: 4, preparationMinutes: 40, calories: 390, protein: 25, carbs: 5, fat: 30, contraindications: ["Cao huyết áp", "Mỡ máu cao"],
  },
  {
    name: "Bò xào hành tây", description: "Thịt bò mềm xào nhanh với hành tây và tỏi.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Thịt bò", 400), pc("Hành tây", 2), g("Tỏi", 10)],
    servings: 4, preparationMinutes: 20, calories: 240, protein: 21, carbs: 8, fat: 14,
  },
  {
    name: "Mực xào chua ngọt", description: "Mực xào với dứa, cà chua và hành tây, sốt chua ngọt.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Mực", 500), g("Dứa", 200), pc("Cà chua", 2), pc("Hành tây", 1)],
    servings: 4, preparationMinutes: 25, calories: 235, protein: 20, carbs: 18, fat: 9, allergens: ["hải sản"], contraindications: ["Tiểu đường", "Gout"],
  },
  {
    name: "Tôm rang thịt", description: "Tôm rang với thịt ba chỉ cháy cạnh, mặn ngọt đậm đà.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Tôm", 300), g("Thịt ba chỉ", 200), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 30, calories: 375, protein: 22, carbs: 4, fat: 30, allergens: ["hải sản"], contraindications: ["Gout", "Mỡ máu cao"],
  },
  {
    name: "Thịt rang cháy cạnh", description: "Thịt ba chỉ rang cháy cạnh với hành tím, thơm và săn.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Thịt ba chỉ", 400), g("Hành tím", 30)],
    servings: 4, preparationMinutes: 30, calories: 535, protein: 9, carbs: 6, fat: 53, contraindications: ["Mỡ máu cao"],
  },
  {
    name: "Cá thu sốt cà chua", description: "Cá thu chiên sơ rồi om trong sốt cà chua, rắc hành lá.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [g("Cá thu", 500), pc("Cà chua", 3), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 35, calories: 305, protein: 24, carbs: 5, fat: 21, allergens: ["cá"],
  },
  {
    name: "Trứng chiên thịt", description: "Trứng gà đánh với thịt heo xay và hành lá, chiên vàng hai mặt.", mealTypes: ["lunch", "dinner"], role: "man",
    ingredients: [pc("Trứng gà", 6), g("Thịt heo xay", 150), g("Hành lá", 20)],
    servings: 4, preparationMinutes: 20, calories: 240, protein: 16, carbs: 1, fat: 19, allergens: ["trứng"], contraindications: ["Mỡ máu cao"],
  },
];

/** Plain ingredient names (the older `ingredients` column) for a seed recipe. */
export const ingredientNames = (recipe: SeedRecipe): string[] => recipe.ingredients.map((ingredient) => ingredient.name);

/** Roles of the first starter dishes (newer starter dishes carry `role` themselves). */
const STARTER_ROLES: Record<string, SeedRole> = {
  "Phở bò": "mot_mon", "Bánh mì trứng ốp la": "sang", "Xôi đậu xanh": "sang", "Cháo gà": "sang",
  "Cháo yến mạch chuối sữa": "sang", "Bún riêu cua": "mot_mon", "Hủ tiếu Nam Vang": "mot_mon", "Bún bò Huế": "mot_mon",
  "Bò kho": "man", "Thịt kho trứng": "man", "Cá kho tộ": "man", "Canh chua cá": "canh", "Rau muống xào tỏi": "xao",
  "Canh bí đỏ thịt bằm": "canh", "Gà kho gừng": "man", "Đậu phụ sốt cà chua": "man", "Trứng xào cà chua": "man",
  "Bò xào bông cải xanh": "xao", "Canh rau ngót thịt bằm": "canh", "Sườn xào chua ngọt": "man", "Tôm rim": "man",
  "Cơm chiên dương châu": "mot_mon", "Bún chả": "mot_mon", "Gỏi cuốn tôm thịt": "khai_vi", "Mực xào cần tây": "xao",
  "Canh khổ qua nhồi thịt": "canh",
};

/** Role of a starter dish. */
export const seedRole = (recipe: SeedRecipe): SeedRole | null => recipe.role ?? STARTER_ROLES[recipe.name] ?? null;
