import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { computeWeekMissing, dishesInRange, weekMissing, weekRange, type CatalogProduct, type WeekDish } from "../services/week-missing";

const today = "2026-11-25"; // a Wednesday
const catalog: CatalogProduct[] = [
  { id: "p-carrot", name: "Cà rốt", englishName: "carrot", unit: "KILOGRAM", imageUrl: "https://img/carrot.jpg", price: 25000, discountPercent: null },
  { id: "p-egg", name: "Trứng gà", englishName: "chicken eggs", unit: "PIECE", imageUrl: null, price: 3500, discountPercent: 10 },
  { id: "p-pork", name: "Thịt heo", englishName: "pork", unit: "KILOGRAM", imageUrl: null, price: 120000, discountPercent: null },
  { id: "p-scallion", name: "Hành lá", englishName: "scallion", unit: "PACK", imageUrl: null, price: 5000, discountPercent: null, packGrams: 100 },
  { id: "p-garlic", name: "Tỏi", englishName: "garlic", unit: "PACK", imageUrl: null, price: 15000, discountPercent: null, packGrams: 200 },
];
const dish = (ingredients: WeekDish["ingredients"], servings = 2, people = 4): WeekDish => ({ ingredients, servings, people });
const run = (dishes: WeekDish[], kho: Parameters<typeof computeWeekMissing>[0]["kho"] = []) => computeWeekMissing({ dishes, kho, catalog, today });
const kho = (name: string, quantity: number, unit: string, extra: Record<string, unknown> = {}) => ({ name, quantity, unit, expiryDate: null, ...extra });

test("amounts scale to the family size and add up across dishes; seasonings and free-text amounts are left out", () => {
  const missing = run([
    dish([{ name: "Cà rốt", quantity: 200, unit: "GRAM" }, { name: "Nước mắm", quantity: 30, unit: "MILLILITER", isSeasoning: true }, { name: "Muối", quantity: null, unit: null, note: "vừa ăn" }]),
    dish([{ name: "cà RỐT", quantity: 300, unit: "GRAM" }], 4, 4),
  ]);
  assert.equal(missing.length, 1);
  // 200 g for 2 → 400 g for 4, plus 300 g → 700 g; sold by the kg in 0.1 kg steps: shown and bought as 0.7 kg.
  assert.deepEqual([missing[0].name, missing[0].quantity, missing[0].unit, missing[0].productId, missing[0].cartQuantity, missing[0].saleUnit, missing[0].unconverted], ["Cà rốt", 0.7, "KILOGRAM", "p-carrot", 0.7, "KILOGRAM", false]);
  assert.equal(missing[0].price, 25000);
});

test("usable Kho is subtracted by productId and by normalized name, in the same measure (g with kg)", () => {
  const dishes = [dish([{ name: "Cà rốt", quantity: 600, unit: "GRAM" }, { name: "Rau rừng", quantity: 300, unit: "GRAM" }], 2, 2)];
  const byProduct = run(dishes, [kho("Cà rốt Đà Lạt", 0.5, "KILOGRAM", { productId: "p-carrot" })]);
  assert.deepEqual(byProduct.map((item) => [item.name, item.quantity, item.unit]), [["Cà rốt", 0.1, "KILOGRAM"], ["Rau rừng", 300, "GRAM"]]);
  const byName = run(dishes, [kho("  RAU  rừng ", 300, "GRAM"), kho("Cà rốt", 1, "KILOGRAM")]);
  assert.equal(byName.length, 0); // N = 0: nothing missing, so no notification
});

test("expired, consumed or past-date Kho stock does not count", () => {
  const dishes = [dish([{ name: "Thịt heo", quantity: 500, unit: "GRAM" }], 1, 1)];
  const missing = run(dishes, [
    kho("Thịt heo", 1, "KILOGRAM", { status: "EXPIRED" }),
    kho("Thịt heo", 1, "KILOGRAM", { status: "CONSUMED" }),
    kho("Thịt heo", 1, "KILOGRAM", { expiryDate: "2026-11-24T00:00:00.000Z" }),
  ]);
  assert.deepEqual(missing.map((item) => [item.name, item.quantity, item.unit]), [["Thịt heo", 0.5, "KILOGRAM"]]);
  assert.equal(run(dishes, [kho("Thịt heo", 1, "KILOGRAM", { expiryDate: "2026-11-24T18:00:00.000Z" })]).length, 0); // 25/11 in Vietnam: still usable today
});

test("an amount with no known conversion is not guessed: recipe unit, no cart quantity, Kho in another measure not subtracted", () => {
  const missing = run([dish([{ name: "Trứng gà", quantity: 3, unit: "PIECE" }], 2, 3), dish([{ name: "Cà rốt", quantity: 2, unit: "PIECE" }], 1, 1)], [kho("Cà rốt", 1, "KILOGRAM")]);
  const egg = missing.find((item) => item.productId === "p-egg");
  assert.deepEqual([egg?.quantity, egg?.unit, egg?.cartQuantity, egg?.unitMismatch], [5, "PIECE", 5, false]); // 3 for 2 → 4.5 → 5 for 3 people
  const carrot = missing.find((item) => item.productId === "p-carrot");
  // This catalog row has no weight per piece: 2 cái stay 2 cái, nothing to add (no more "Mua 1 kg").
  assert.deepEqual([carrot?.quantity, carrot?.unit, carrot?.unitMismatch, carrot?.cartQuantity, carrot?.unconverted], [2, "PIECE", true, null, true]);
});

test("kg products round the missing amount up to 0.1 kg (at least 0.1 kg, at most 20 kg)", () => {
  const cart = (grams: number) => run([dish([{ name: "Thịt heo", quantity: grams, unit: "GRAM" }], 1, 1)])[0].cartQuantity;
  assert.deepEqual([cart(30), cart(100), cart(650), cart(1501), cart(25000)], [0.1, 0.1, 0.7, 1.6, 20]);
});

test("pack products convert grams through their pack weight, in recipes and in Kho", () => {
  // 150 g of Hành lá at 100 g a bó → 2 bó; 250 g of Tỏi at 200 g a gói → 2 gói.
  const missing = run([dish([{ name: "Hành lá", quantity: 150, unit: "GRAM" }, { name: "Tỏi", quantity: 250, unit: "GRAM" }], 1, 1)]);
  assert.deepEqual(missing.map((item) => [item.name, item.quantity, item.unit, item.saleUnit, item.cartQuantity]), [["Hành lá", 2, "PACK", "PACK", 2], ["Tỏi", 2, "PACK", "PACK", 2]]);
  // 1 bó in Kho covers 100 g: 50 g still missing → 1 bó. 2 gói of Tỏi (400 g) cover 250 g.
  const withKho = run([dish([{ name: "Hành lá", quantity: 150, unit: "GRAM" }, { name: "Tỏi", quantity: 250, unit: "GRAM" }], 1, 1)], [kho("Hành lá", 1, "PACK", { productId: "p-scallion" }), kho("Tỏi", 2, "PACK")]);
  assert.deepEqual(withKho.map((item) => [item.name, item.quantity, item.unit, item.cartQuantity, item.unitMismatch]), [["Hành lá", 1, "PACK", 1, false]]);
});

test("piece products with a weight per unit: pieces stay pieces, grams become pieces, bottles count ml", () => {
  const pieceCatalog: CatalogProduct[] = [
    { id: "p-egg", name: "Trứng gà", unit: "PIECE", imageUrl: null, price: 3500, discountPercent: null, packGrams: 55, unitLabel: "quả" },
    { id: "p-pomelo", name: "Bưởi", unit: "PIECE", imageUrl: null, price: 60000, discountPercent: null, packGrams: 1200, unitLabel: "quả" },
    { id: "p-milk", name: "Sữa tươi", unit: "BOTTLE", imageUrl: null, price: 35000, discountPercent: null, packGrams: 1000, unitLabel: null },
  ];
  const missing = computeWeekMissing({
    dishes: [dish([{ name: "Trứng gà", quantity: 3, unit: "PIECE" }], 2, 3), dish([{ name: "Bưởi", quantity: 500, unit: "GRAM" }, { name: "Sữa tươi", quantity: 1500, unit: "MILLILITER" }], 1, 1)],
    kho: [kho("Trứng gà", 2, "PIECE"), kho("Sữa tươi", 1, "BOTTLE")],
    catalog: pieceCatalog, today,
  });
  const row = (name: string) => { const item = missing.find((entry) => entry.name === name)!; return [item.quantity, item.unit, item.cartQuantity, item.saleUnit, item.saleUnitLabel, item.unitMismatch]; };
  // 3 eggs for 2 → 4.5 for 3 people, 2 in Kho: 2.5 → 3 quả (shown in quả, not grams).
  assert.deepEqual(row("Trứng gà"), [3, "PIECE", 3, "PIECE", "quả", false]);
  // 500 g of bưởi at 1.2 kg a quả → 1 quả.
  assert.deepEqual(row("Bưởi"), [1, "PIECE", 1, "PIECE", "quả", false]);
  // 1.5 l of milk, 1 bottle (1 l) in Kho → 500 ml missing → 1 chai.
  assert.deepEqual(row("Sữa tươi"), [1, "BOTTLE", 1, "BOTTLE", null, false]);
});

const weighed: CatalogProduct[] = [
  { id: "p-tomato", name: "Cà chua", unit: "KILOGRAM", imageUrl: null, price: 30000, discountPercent: null, pieceGrams: 100 },
  { id: "p-orange", name: "Cam", unit: "KILOGRAM", imageUrl: null, price: 45000, discountPercent: null, pieceGrams: 200 },
  { id: "p-carrot", name: "Cà rốt", unit: "KILOGRAM", imageUrl: null, price: 25000, discountPercent: null, pieceGrams: 150 },
  { id: "p-bun", name: "Bún", unit: "PACK", imageUrl: null, price: 12000, discountPercent: null, packGrams: 500 },
  { id: "p-ricepaper", name: "Bánh tráng", unit: "PACK", imageUrl: null, price: 20000, discountPercent: null, packGrams: 300, pieceGrams: 10 },
  { id: "p-broccoli", name: "Bông cải xanh", unit: "PIECE", imageUrl: null, price: 25000, discountPercent: null, packGrams: 400, unitLabel: "cái" },
  { id: "p-cream", name: "Kem tươi", unit: "BOX", imageUrl: null, price: 65000, discountPercent: null, packGrams: 250 },
  { id: "p-noodle", name: "Hủ tiếu", unit: "PACK", imageUrl: null, price: 15000, discountPercent: null },
  { id: "p-cucumber", name: "Dưa leo", unit: "KILOGRAM", imageUrl: null, price: 25000, discountPercent: null },
];
const runWeighed = (dishes: WeekDish[], khoRows: Parameters<typeof computeWeekMissing>[0]["kho"] = []) => computeWeekMissing({ dishes, kho: khoRows, catalog: weighed, today });
const line = (items: ReturnType<typeof runWeighed>, name: string) => { const item = items.find((entry) => entry.name === name)!; return [item.quantity, item.unit, item.cartQuantity, item.unconverted]; };

test("pieces of a kg product convert through the weight of one piece and round up to 0.1 kg", () => {
  // The reported week: 60 quả cà chua (≈ 100 g) → 6 kg; 10 củ cà rốt (≈ 150 g) → 1.5 kg; 12 quả cam (≈ 200 g) → 2.4 kg.
  const missing = runWeighed([dish([{ name: "Cà chua", quantity: 60, unit: "PIECE" }, { name: "Cà rốt", quantity: 10, unit: "PIECE" }, { name: "Cam", quantity: 12, unit: "PIECE" }], 4, 4)]);
  assert.deepEqual(line(missing, "Cà chua"), [6, "KILOGRAM", 6, false]);
  assert.deepEqual(line(missing, "Cà rốt"), [1.5, "KILOGRAM", 1.5, false]);
  assert.deepEqual(line(missing, "Cam"), [2.4, "KILOGRAM", 2.4, false]);
  // Pieces and grams of the same product add up in the sale measure: 3 quả (300 g) + 250 g = 550 g → 0.6 kg.
  assert.deepEqual(line(runWeighed([dish([{ name: "Cà chua", quantity: 3, unit: "PIECE" }], 1, 1), dish([{ name: "Cà chua", quantity: 250, unit: "GRAM" }], 1, 1)]), "Cà chua"), [0.6, "KILOGRAM", 0.6, false]);
  // Kho counted in pieces is converted too: 5 quả (500 g) in Kho cover 5 of the 7 needed → 200 g → 0.2 kg.
  assert.deepEqual(line(runWeighed([dish([{ name: "Cà chua", quantity: 7, unit: "PIECE" }], 1, 1)], [kho("Cà chua", 5, "PIECE")]), "Cà chua"), [0.2, "KILOGRAM", 0.2, false]);
  // Fully covered by 1 kg in Kho: nothing missing.
  assert.equal(runWeighed([dish([{ name: "Cà chua", quantity: 7, unit: "PIECE" }], 1, 1)], [kho("Cà chua", 1, "KILOGRAM")]).length, 0);
});

test("grams of a pack product convert through its pack weight; pieces of a pack through the piece weight", () => {
  // 2.14 kg of bún at 500 g a gói → 5 gói (not "1 gói"); 2.14 kg of bông cải xanh at 400 g a cái → 6 cái.
  const missing = runWeighed([dish([{ name: "Bún", quantity: 2140, unit: "GRAM" }, { name: "Bông cải xanh", quantity: 2140, unit: "GRAM" }, { name: "Bánh tráng", quantity: 36, unit: "PIECE" }], 1, 1)]);
  assert.deepEqual(line(missing, "Bún"), [5, "PACK", 5, false]);
  assert.deepEqual(line(missing, "Bông cải xanh"), [6, "PIECE", 6, false]);
  // 36 lá at 10 g = 360 g, 300 g a gói → 2 gói.
  assert.deepEqual(line(missing, "Bánh tráng"), [2, "PACK", 2, false]);
  // ml of a liquid sold by weight (≈ 1 g/ml): 300 ml of kem tươi at 250 g a hộp → 2 hộp.
  assert.deepEqual(line(runWeighed([dish([{ name: "Kem tươi", quantity: 300, unit: "MILLILITER" }], 1, 1)]), "Kem tươi"), [2, "BOX", 2, false]);
});

test("unknown conversion: shown in the recipe unit, not added to the cart, and reported in the response", async () => {
  // A pack without a pack weight cannot take grams; a kg product without a piece weight cannot take pieces.
  const missing = runWeighed([dish([{ name: "Hủ tiếu", quantity: 400, unit: "GRAM" }, { name: "Dưa leo", quantity: 3, unit: "PIECE" }], 1, 1)]);
  assert.deepEqual(line(missing, "Hủ tiếu"), [400, "GRAM", null, true]);
  assert.deepEqual(line(missing, "Dưa leo"), [3, "PIECE", null, true]);
  const client = { menu: { findMany: async () => [{ startDate: new Date("2026-11-25T00:00:00Z"), servings: 1, items: [{ recipeId: "r1", dayOfWeek: 3, details: null }] }] } } as unknown as PrismaClient;
  const recipes = [{ id: "r1", name: "Hủ tiếu", ingredients: [], ingredientDetails: [{ name: "Hủ tiếu", quantity: 400, unit: "GRAM" }, { name: "Cà chua", quantity: 2, unit: "PIECE" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role: "mot_mon", servings: 1, allergens: [], contraindications: [], cuisine: null }];
  const result = await weekMissing({ userId: "u1", familyId: "f1" }, client, { now: new Date("2026-11-25T03:00:00Z"), recipes, inventoryItems: [], catalog: weighed });
  assert.deepEqual(result.unconverted, [{ name: "Hủ tiếu", productId: "p-noodle", recipeUnit: "GRAM", saleUnit: "PACK" }]);
  assert.deepEqual(result.items.map((item) => [item.name, item.quantity, item.unit, item.cartQuantity]), [["Cà chua", 0.2, "KILOGRAM", 0.2], ["Hủ tiếu", 400, "GRAM", null]]);
});

test("no double scaling: each dish is scaled once to the menu's people; a recipe item does not also count its AI dish", () => {
  const menus = [{ startDate: new Date("2026-11-26T00:00:00Z"), servings: null, items: [
    { recipeId: "r-canh", dayOfWeek: 4, details: { aiDish: { servings: 1, ingredients: [{ name: "Cà chua", quantity: 9, unit: "PIECE" }] } } },
    { recipeId: null, dayOfWeek: 4, details: { aiDish: { servings: 2, ingredients: [{ name: "Cà chua", quantity: 2, unit: "PIECE" }] } } },
  ] }];
  const recipes = [{ id: "r-canh", name: "Canh trứng cà chua", ingredients: [], details: [{ name: "Cà chua", quantity: 2, unit: "PIECE" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role: "canh", servings: 4, allergens: [], contraindications: [], cuisine: null }];
  // servings null → the family's 4 members: recipe 2 quả for 4 → 2; AI dish 2 quả for 2 → 4. 6 quả = 600 g → 0.6 kg.
  const dishes = dishesInRange(menus, recipes, { from: "2026-11-25", to: "2026-11-29" }, 4);
  assert.deepEqual(dishes.map((entry) => entry.people), [4, 4]);
  assert.deepEqual(line(runWeighed(dishes), "Cà chua"), [0.6, "KILOGRAM", 0.6, false]);
  // perPerson is applied once: 1 quả per 2 people → rounded per person (1) × 4 = 4 quả.
  assert.deepEqual(line(runWeighed([dish([{ name: "Cà chua", quantity: 1, unit: "PIECE", perPerson: true }], 2, 4)]), "Cà chua"), [0.4, "KILOGRAM", 0.4, false]);
});

test("items not sold in Đi chợ have no product, image, price or cart quantity", () => {
  const [item] = run([dish([{ name: "Lá lốt", quantity: 50, unit: "GRAM" }], 1, 1)]);
  assert.deepEqual([item.productId, item.imageUrl, item.price, item.cartQuantity, item.saleUnit], [null, null, null, null, null]);
});

test("week range: today through Sunday (Vietnam days); dishes outside it are ignored", () => {
  assert.deepEqual(weekRange(new Date("2026-11-25T03:00:00Z")), { from: "2026-11-25", to: "2026-11-29" });
  assert.deepEqual(weekRange(new Date("2026-11-29T16:30:00Z")), { from: "2026-11-29", to: "2026-11-29" }); // Sunday 23:30 in Vietnam: just today
  const menus = [
    { startDate: new Date("2026-11-24T00:00:00Z"), servings: 2, items: [{ recipeId: "r1", dayOfWeek: 2, details: null }] }, // Tuesday: before today
    { startDate: new Date("2026-11-26T00:00:00Z"), servings: 2, items: [{ recipeId: "r1", dayOfWeek: 4, details: null }] }, // Thursday
    { startDate: new Date("2026-11-30T00:00:00Z"), servings: 2, items: [{ recipeId: "r1", dayOfWeek: 1, details: null }] }, // next Monday
  ];
  const recipes = [{ id: "r1", name: "Canh", ingredients: ["Cà rốt"], details: [{ name: "Cà rốt", quantity: 100, unit: "GRAM" }], imageUrl: null, isActive: true, mealTypes: [], dietaryTags: [], tags: [], role: "canh", servings: 2, allergens: [], contraindications: [], cuisine: null }];
  assert.equal(dishesInRange(menus, recipes, { from: "2026-11-25", to: "2026-11-29" }).length, 1);
});

test("no family: nothing to compare, no notification (and no database or service calls)", async () => {
  const client = { menu: { findMany: async () => { throw new Error("must not be called"); } } } as unknown as PrismaClient;
  const result = await weekMissing({ userId: "u1", familyId: null }, client, { now: new Date("2026-11-25T03:00:00Z") });
  assert.deepEqual([result.count, result.items.length], [0, 0]);
});

test("an Đi chợ order still being delivered counts as covered (not bought twice), but is not cookable", async () => {
  const { usableKho } = await import("../services/kho-suggest");
  const pending = kho("Thịt heo", 1, "KILOGRAM", { pendingDelivery: true });
  assert.equal(run([dish([{ name: "Thịt heo", quantity: 500, unit: "GRAM" }], 1, 1)], [pending]).length, 0);
  assert.deepEqual(usableKho([pending, kho("Cà rốt", 1, "KILOGRAM")], today).map((item) => item.name), ["Cà rốt"]);
});
