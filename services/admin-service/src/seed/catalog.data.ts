/**
 * Starter catalog: common Vietnamese market ingredients. `en` is only used to search Wikimedia Commons for a photo
 * (scripts/fill-catalog-images); it is not stored. Units are the shared Kho / Giỏ hàng codes. kcal per 100 g are
 * approximate (raw); no prices (admins set them).
 */
export type CatalogUnit = "GRAM" | "KILOGRAM" | "MILLILITER" | "LITER" | "PIECE" | "PACK" | "BOTTLE" | "CAN" | "BOX";
export type CatalogSeed = { name: string; en: string; group: string; unit: CatalogUnit; shelfLifeDays: number; kcal: number };

const item = (group: string, unit: CatalogUnit) => (name: string, en: string, shelfLifeDays: number, kcal: number): CatalogSeed =>
  ({ name, en, group, unit, shelfLifeDays, kcal });

const rau = item("Rau củ", "GRAM");
const rauCai = item("Rau củ", "PIECE");
const traiCay = item("Trái cây", "PIECE");
const traiCayKg = item("Trái cây", "KILOGRAM");
const thit = item("Thịt", "GRAM");
const haiSan = item("Hải sản", "GRAM");
const trung = item("Trứng & sữa", "PIECE");
const sua = item("Trứng & sữa", "BOX");
const kho = item("Đồ khô & gạo", "GRAM");
const khoKg = item("Đồ khô & gạo", "KILOGRAM");
const khoGoi = item("Đồ khô & gạo", "PACK");
const giaVi = item("Gia vị", "BOTTLE");
const giaViGoi = item("Gia vị", "PACK");
const doUong = item("Đồ uống", "BOTTLE");
const doUongGoi = item("Đồ uống", "PACK");
const dongLanh = item("Đồ đông lạnh", "PACK");

/**
 * Names taken out of the starter catalog on purpose: never created by the seed, even on a fresh database or if one
 * is listed again by mistake. (Products an admin deleted or renamed are skipped through their audit rows.)
 * - Nước suối: a drink, not a cooking ingredient.
 * - Rau sống: a plate of mixed fresh greens; recipes list Xà lách, Rau thơm, Giá đỗ... instead.
 */
export const retiredStarterNames: readonly string[] = ["Nước suối", "Rau sống"];

export const catalogSeed: CatalogSeed[] = [
  // Rau củ
  rau("Cà chua", "tomato", 7, 18), rau("Khoai tây", "potato", 30, 77), rau("Cà rốt", "carrot", 21, 41),
  rau("Bông cải xanh", "broccoli", 5, 34), rau("Súp lơ trắng", "cauliflower", 7, 25), rau("Rau muống", "water spinach", 3, 19),
  rau("Cải thìa", "bok choy", 4, 13), rauCai("Bắp cải", "cabbage", 14, 25), rau("Dưa leo", "cucumber", 7, 15),
  rau("Hành tây", "onion", 30, 40), rau("Tỏi", "garlic", 60, 149), rau("Gừng", "ginger root", 30, 80),
  rau("Hành lá", "scallion", 5, 32), rau("Ớt", "chili pepper", 14, 40), rau("Sả", "lemongrass", 14, 99),
  rau("Bí đỏ", "pumpkin", 30, 26), rau("Bí xanh", "winter melon", 14, 13), rau("Khổ qua", "bitter melon", 5, 17),
  rau("Đậu que", "green beans", 5, 31), rau("Đậu bắp", "okra", 4, 33), rau("Cà tím", "eggplant", 7, 25),
  rau("Rau ngót", "Sauropus androgynus", 3, 35), rau("Cải xanh", "mustard greens", 4, 27), rau("Xà lách", "lettuce", 5, 15),
  rau("Giá đỗ", "mung bean sprouts", 2, 30), rau("Nấm rơm", "straw mushroom", 3, 32), rau("Nấm hương", "shiitake", 7, 34),
  rau("Khoai lang", "sweet potato", 30, 86), rau("Củ cải trắng", "daikon", 14, 18), rauCai("Ngô ngọt", "sweet corn", 5, 86),
  rau("Hành tím", "shallot", 30, 72), rau("Rau mùi", "coriander leaves", 5, 23),
  // Trái cây
  traiCay("Chuối", "banana", 5, 89), traiCay("Táo", "apple", 21, 52), traiCay("Cam", "orange fruit", 14, 47),
  traiCay("Thanh long", "dragon fruit", 7, 60), traiCay("Xoài", "mango", 5, 60), traiCayKg("Dưa hấu", "watermelon", 7, 30),
  traiCay("Đu đủ", "papaya", 5, 43), traiCay("Bưởi", "pomelo", 21, 38), traiCay("Dứa", "pineapple", 5, 50),
  traiCay("Ổi", "guava", 5, 68), traiCay("Chanh", "lime fruit", 14, 30), traiCayKg("Nho", "grapes", 7, 69),
  // Thịt
  thit("Thịt heo", "pork meat", 3, 242), thit("Thịt ba chỉ", "pork belly", 3, 350), thit("Sườn heo", "pork ribs", 3, 277),
  thit("Thịt bò", "beef meat", 3, 250), thit("Thịt gà", "chicken meat", 2, 215), thit("Đùi gà", "chicken drumstick", 2, 214),
  thit("Thịt vịt", "duck meat", 2, 400), thit("Thịt heo xay", "ground pork", 2, 263),
  // Hải sản
  haiSan("Cá basa", "pangasius fillet", 2, 90), haiSan("Cá thu", "mackerel fish", 2, 205), haiSan("Cá hồi", "salmon fillet", 2, 208),
  haiSan("Tôm", "shrimp", 2, 99), haiSan("Mực", "squid", 2, 92), haiSan("Cua đồng", "freshwater crab", 1, 87),
  haiSan("Nghêu", "clams", 1, 74),
  // Trứng & sữa
  trung("Trứng gà", "chicken eggs", 21, 143), trung("Trứng vịt", "duck eggs", 21, 185), sua("Sữa tươi", "milk carton", 7, 62),
  sua("Sữa chua", "yogurt", 14, 61), item("Trứng & sữa", "PACK")("Phô mai", "cheese", 30, 402), item("Trứng & sữa", "PACK")("Bơ lạt", "butter", 60, 717),
  // Đồ khô & gạo
  khoKg("Gạo", "rice grains", 365, 360), khoKg("Gạo nếp", "glutinous rice", 365, 370), khoGoi("Bún", "rice vermicelli", 3, 110),
  khoGoi("Bánh phở", "pho noodles", 3, 110), khoGoi("Mì gói", "instant noodles", 180, 436), khoGoi("Miến", "glass noodles", 365, 351),
  kho("Đậu xanh", "mung beans", 365, 347), kho("Lạc", "peanuts", 180, 567), item("Đồ khô & gạo", "PIECE")("Đậu phụ", "tofu", 3, 76),
  khoKg("Bột mì", "wheat flour", 180, 364), kho("Đậu đen", "black beans", 365, 341), kho("Mè", "sesame seeds", 180, 573),
  item("Đồ khô & gạo", "PIECE")("Bánh mì", "banh mi bread", 2, 265),
  // Gia vị
  giaViGoi("Muối", "table salt", 1095, 0), item("Gia vị", "KILOGRAM")("Đường", "white sugar", 730, 387), giaVi("Nước mắm", "fish sauce", 730, 35),
  giaVi("Nước tương", "soy sauce", 730, 53), giaVi("Dầu ăn", "cooking oil", 365, 884), giaViGoi("Tiêu", "black pepper", 730, 251),
  giaViGoi("Hạt nêm", "bouillon powder", 365, 200), giaVi("Giấm", "vinegar", 730, 18), giaVi("Tương ớt", "chili sauce", 365, 93),
  // Đồ uống
  doUong("Nước dừa", "coconut water", 5, 19), doUongGoi("Trà xanh", "green tea leaves", 365, 1),
  doUongGoi("Cà phê", "coffee beans", 180, 2), doUong("Sữa đậu nành", "soy milk", 5, 54),
  // Đồ đông lạnh
  dongLanh("Xúc xích", "sausage", 30, 300), dongLanh("Chả giò", "cha gio spring rolls", 90, 250), dongLanh("Há cảo", "har gow dumplings", 90, 220),
  item("Đồ đông lạnh", "BOX")("Kem", "ice cream", 180, 207), dongLanh("Đậu Hà Lan", "green peas", 180, 81),
  // For foreign home dishes (Mì Ý, cà ri Nhật, kimbap, món Hàn, súp kem...). "Mè" already covers mè rang.
  khoGoi("Mì Ý", "spaghetti pasta", 365, 371), khoGoi("Rong biển", "nori seaweed sheets", 180, 188), khoGoi("Bánh mì sandwich", "sliced white bread", 5, 265),
  giaVi("Sốt cà chua", "tomato pasta sauce", 180, 50), giaViGoi("Bột cà ri", "curry powder", 365, 325), item("Gia vị", "BOX")("Tương ớt Hàn", "gochujang", 365, 230),
  sua("Kem tươi", "whipping cream", 14, 340), traiCay("Quả bơ", "avocado fruit", 5, 160), rauCai("Ớt chuông", "bell pepper", 7, 31),
  rau("Nấm mỡ", "button mushroom", 5, 22), item("Thịt", "PACK")("Thịt xông khói", "bacon", 14, 417), item("Rau củ", "PACK")("Kim chi", "kimchi", 30, 15),
  // Ingredients the starter recipes use that were missing ("Cần mua tuần này" then finds them in Đi chợ).
  item("Thịt", "KILOGRAM")("Xương heo", "pork bones", 2, 150),
  item("Thịt", "KILOGRAM")("Xương bò", "beef bones", 2, 160),
  item("Thịt", "KILOGRAM")("Giò heo", "pork hock", 2, 250),
  item("Thịt", "KILOGRAM")("Giò sống", "raw pork paste", 2, 200),
  item("Thịt", "KILOGRAM")("Chả lụa", "vietnamese pork roll", 7, 136),
  item("Thịt", "PACK")("Lạp xưởng", "chinese sausage", 90, 450),
  item("Khác", "CAN")("Pa tê", "liver pate", 365, 320),
  item("Hải sản", "PACK")("Thịt cua", "crab meat", 3, 85),
  item("Rau củ", "PACK")("Cải ngọt", "choy sum", 4, 15),
  item("Rau củ", "PACK")("Rau lang", "sweet potato leaves", 3, 22),
  item("Rau củ", "KILOGRAM")("Su su", "chayote", 14, 19),
  item("Rau củ", "PACK")("Cần tây", "celery", 7, 16),
  item("Rau củ", "PACK")("Rau thơm", "fresh herbs", 3, 25),
  item("Đồ khô & gạo", "PACK")("Nấm mèo", "dried wood ear mushroom", 365, 300),
  item("Đồ khô & gạo", "PACK")("Yến mạch", "rolled oats", 365, 389),
  item("Đồ khô & gạo", "KILOGRAM")("Đậu nành", "dried soybeans", 365, 446),
  item("Đồ khô & gạo", "PACK")("Bột chiên giòn", "crispy frying batter mix", 365, 350),
  item("Đồ khô & gạo", "CAN")("Nước cốt dừa", "coconut milk", 365, 230),
  item("Đồ khô & gạo", "PACK")("Bánh tráng", "rice paper", 365, 330),
  item("Đồ khô & gạo", "PACK")("Hủ tiếu", "rice noodles", 3, 140),
  item("Đồ khô & gạo", "PACK")("Bánh canh", "thick tapioca noodles", 3, 140),
  item("Đồ khô & gạo", "PACK")("Bánh cuốn", "steamed rice rolls", 2, 120),
  item("Đồ khô & gạo", "PACK")("Mì Quảng", "quang noodles", 3, 140),
  item("Trứng & sữa", "CAN")("Sữa đặc", "sweetened condensed milk", 365, 321),
  item("Gia vị", "BOTTLE")("Dầu điều", "annatto oil", 365, 884),
  item("Gia vị", "BOTTLE")("Dầu mè", "sesame oil", 365, 884),
  item("Gia vị", "BOTTLE")("Dầu ô liu", "olive oil", 730, 884),
  item("Gia vị", "PACK")("Ngũ vị hương", "five spice powder", 730, 347),
  item("Gia vị", "PACK")("Hoa hồi", "star anise", 730, 337),
  item("Gia vị", "PACK")("Quế", "cinnamon sticks", 730, 247),
  item("Gia vị", "BOX")("Mắm ruốc", "fermented shrimp paste", 365, 73),
  item("Gia vị", "PACK")("Me chua", "tamarind", 365, 239),
  item("Gia vị", "BOTTLE")("Tương cà", "tomato ketchup", 365, 101),
];

/**
 * English alias for photo recognition (CLIP prompt "a photo of <alias>"), stored as englishName. Defaults to `en`;
 * listed here where the Commons search term is not how a photo of the product would be described.
 */
export const ENGLISH_NAME_OVERRIDES: Record<string, string> = {
  "Rau ngót": "katuk leaves", "Bánh mì": "baguette bread", "Bánh phở": "flat rice noodles", "Gạo": "uncooked white rice",
  "Cá basa": "white fish fillet", "Sữa tươi": "a carton of milk",
};
export const englishNameFor = (entry: CatalogSeed): string => ENGLISH_NAME_OVERRIDES[entry.name] ?? entry.en;

/**
 * Protein / carbs / fat per 100 g for the staples (general food-composition values; carbs net of fiber so that
 * 4 / 4 / 9 kcal per gram adds up to the kcal above within 5%). Stored on new rows by the startup seed.
 */
export const catalogMacros: Record<string, [protein: number, carbs: number, fat: number]> = {
  "Gạo": [7.1, 79, 0.7], "Thịt bò": [26, 0, 17], "Thịt heo": [17, 0, 19], "Thịt gà": [18.6, 0, 15], "Trứng gà": [12.6, 0.7, 9.5],
  "Tôm": [24, 0.2, 0.3], "Cá basa": [15, 0, 3.4], "Đậu phụ": [8, 1.9, 4.2], "Lạc": [25.8, 13, 45], "Đậu xanh": [23.9, 62.6, 1.2],
  "Sữa tươi": [3.2, 4.8, 3.3], "Sữa chua": [3.5, 4.7, 3.3], "Chuối": [1.1, 20.2, 0.3], "Cam": [0.9, 10.5, 0.1], "Cà chua": [0.9, 3.3, 0.2],
  "Cà rốt": [0.9, 9, 0.2], "Bắp cải": [1.3, 4.8, 0.1], "Rau muống": [2.6, 1.8, 0.2], "Bí đỏ": [1, 5.3, 0.1], "Bông cải xanh": [2.8, 4.8, 0.4],
  "Cải thìa": [1.5, 1.4, 0.2], "Dưa leo": [0.7, 2.8, 0.1], "Gừng": [1.8, 16.4, 0.8], "Hành tây": [1.1, 8.7, 0.1], "Khoai tây": [2, 17.5, 0.1],
  "Nấm rơm": [3.8, 2.6, 0.7], "Táo": [0.3, 12.3, 0.2], "Thanh long": [1.2, 13, 0.4], "Tỏi": [6.4, 29.8, 0.5], "Đậu que": [1.8, 5.4, 0.2],
};
