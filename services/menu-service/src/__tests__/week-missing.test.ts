import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { computeWeekMissing, dishesInRange, weekMissing, weekRange, type CatalogProduct, type WeekDish } from "../services/week-missing";

const today = "2026-11-25"; // a Wednesday
const catalog: CatalogProduct[] = [
  { id: "p-carrot", name: "Cà rốt", englishName: "carrot", unit: "KILOGRAM", imageUrl: "https://img/carrot.jpg", price: 25000, discountPercent: null },
  { id: "p-egg", name: "Trứng gà", englishName: "chicken eggs", unit: "PIECE", imageUrl: null, price: 3500, discountPercent: 10 },
  { id: "p-pork", name: "Thịt heo", englishName: "pork", unit: "KILOGRAM", imageUrl: null, price: 120000, discountPercent: null },
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
  // 200 g for 2 → 400 g for 4, plus 300 g → 700 g; sold by the kg: 1 kg to buy.
  assert.deepEqual([missing[0].name, missing[0].quantity, missing[0].unit, missing[0].productId, missing[0].cartQuantity, missing[0].saleUnit], ["Cà rốt", 700, "GRAM", "p-carrot", 1, "KILOGRAM"]);
  assert.equal(missing[0].price, 25000);
});

test("usable Kho is subtracted by productId and by normalized name, in the same measure (g with kg)", () => {
  const dishes = [dish([{ name: "Cà rốt", quantity: 600, unit: "GRAM" }, { name: "Rau rừng", quantity: 300, unit: "GRAM" }], 2, 2)];
  const byProduct = run(dishes, [kho("Cà rốt Đà Lạt", 0.5, "KILOGRAM", { productId: "p-carrot" })]);
  assert.deepEqual(byProduct.map((item) => [item.name, item.quantity, item.unit]), [["Cà rốt", 100, "GRAM"], ["Rau rừng", 300, "GRAM"]]);
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
  assert.deepEqual(missing.map((item) => [item.name, item.quantity, item.unit]), [["Thịt heo", 500, "GRAM"]]);
  assert.equal(run(dishes, [kho("Thịt heo", 1, "KILOGRAM", { expiryDate: "2026-11-24T18:00:00.000Z" })]).length, 0); // 25/11 in Vietnam: still usable today
});

test("a different measure is not subtracted and is reported as a unit mismatch; pieces round up for the cart", () => {
  const missing = run([dish([{ name: "Trứng gà", quantity: 3, unit: "PIECE" }], 2, 3), dish([{ name: "Cà rốt", quantity: 2, unit: "PIECE" }], 1, 1)], [kho("Cà rốt", 1, "KILOGRAM")]);
  const egg = missing.find((item) => item.productId === "p-egg");
  assert.deepEqual([egg?.quantity, egg?.unit, egg?.cartQuantity, egg?.unitMismatch], [5, "PIECE", 5, false]); // 3 for 2 → 4.5 → 5 for 3 people
  const carrot = missing.find((item) => item.productId === "p-carrot");
  assert.deepEqual([carrot?.quantity, carrot?.unit, carrot?.unitMismatch, carrot?.cartQuantity], [2, "PIECE", true, 1]);
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
