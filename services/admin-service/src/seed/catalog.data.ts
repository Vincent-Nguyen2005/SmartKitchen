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
  thit("Thịt heo", "pork meat", 3, 242), thit("Thịt ba chỉ", "pork belly", 3, 518), thit("Sườn heo", "pork ribs", 3, 277),
  thit("Thịt bò", "beef meat", 3, 250), thit("Thịt gà", "chicken meat", 2, 239), thit("Đùi gà", "chicken drumstick", 2, 214),
  thit("Thịt vịt", "duck meat", 2, 337), thit("Thịt heo xay", "ground pork", 2, 263),
  // Hải sản
  haiSan("Cá basa", "pangasius fillet", 2, 90), haiSan("Cá thu", "mackerel fish", 2, 205), haiSan("Cá hồi", "salmon fillet", 2, 208),
  haiSan("Tôm", "shrimp", 2, 99), haiSan("Mực", "squid", 2, 92), haiSan("Cua đồng", "freshwater crab", 1, 87),
  haiSan("Nghêu", "clams", 1, 74),
  // Trứng & sữa
  trung("Trứng gà", "chicken eggs", 21, 155), trung("Trứng vịt", "duck eggs", 21, 185), sua("Sữa tươi", "milk carton", 7, 42),
  sua("Sữa chua", "yogurt", 14, 61), item("Trứng & sữa", "PACK")("Phô mai", "cheese", 30, 402), item("Trứng & sữa", "PACK")("Bơ", "butter", 60, 717),
  // Đồ khô & gạo
  khoKg("Gạo", "rice grains", 365, 365), khoKg("Gạo nếp", "glutinous rice", 365, 370), khoGoi("Bún", "rice vermicelli", 3, 110),
  khoGoi("Bánh phở", "pho noodles", 3, 110), khoGoi("Mì gói", "instant noodles", 180, 436), khoGoi("Miến", "glass noodles", 365, 351),
  kho("Đậu xanh", "mung beans", 365, 347), kho("Lạc", "peanuts", 180, 567), item("Đồ khô & gạo", "PIECE")("Đậu phụ", "tofu", 3, 76),
  khoKg("Bột mì", "wheat flour", 180, 364), kho("Đậu đen", "black beans", 365, 341), kho("Mè", "sesame seeds", 180, 573),
  item("Đồ khô & gạo", "PIECE")("Bánh mì", "banh mi bread", 2, 265),
  // Gia vị
  giaViGoi("Muối", "table salt", 1095, 0), item("Gia vị", "KILOGRAM")("Đường", "white sugar", 730, 387), giaVi("Nước mắm", "fish sauce", 730, 35),
  giaVi("Nước tương", "soy sauce", 730, 53), giaVi("Dầu ăn", "cooking oil", 365, 884), giaViGoi("Tiêu", "black pepper", 730, 251),
  giaViGoi("Hạt nêm", "bouillon powder", 365, 200), giaVi("Giấm", "vinegar", 730, 18), giaVi("Tương ớt", "chili sauce", 365, 93),
  // Đồ uống
  doUong("Nước suối", "bottled water", 365, 0), doUong("Nước dừa", "coconut water", 5, 19), doUongGoi("Trà xanh", "green tea leaves", 365, 1),
  doUongGoi("Cà phê", "coffee beans", 180, 2), doUong("Sữa đậu nành", "soy milk", 5, 54),
  // Đồ đông lạnh
  dongLanh("Xúc xích", "sausage", 30, 300), dongLanh("Chả giò", "cha gio spring rolls", 90, 250), dongLanh("Há cảo", "har gow dumplings", 90, 220),
  item("Đồ đông lạnh", "BOX")("Kem", "ice cream", 180, 207), dongLanh("Đậu Hà Lan", "green peas", 180, 81),
];
