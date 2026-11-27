import assert from "node:assert/strict";
import test from "node:test";
import { PeriodType, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateMenu } from "../services/menu.service";
import { menuPeople, recipeServings, roundQuantity, scaleIngredients, scaleQuantity } from "../services/portions";

test("scaling: normal ingredients x people / servings, unchanged when they are equal", () => {
  assert.equal(scaleQuantity({ name: "Thịt gà", quantity: 300, unit: "GRAM" }, 2, 4), 600);
  assert.equal(scaleQuantity({ name: "Thịt gà", quantity: 250, unit: "GRAM" }, 2, 3), 375);
  assert.equal(scaleQuantity({ name: "Gừng", quantity: 12, unit: "GRAM" }, 2, 2), 12, "same people: the recipe's own amount");
  assert.equal(scaleQuantity({ name: "Thịt bò", quantity: 0.5, unit: "KILOGRAM" }, 2, 3), 0.75);
});

test("rounding: pieces up, g/ml to the nearest 5 (min 5), kg/lít 2 decimals", () => {
  assert.equal(scaleQuantity({ name: "Cà chua", quantity: 3, unit: "PIECE" }, 2, 3), 5);
  assert.equal(scaleQuantity({ name: "Nước dừa", quantity: 12, unit: "MILLILITER" }, 2, 3), 20);
  assert.equal(scaleQuantity({ name: "Tiêu", quantity: 2, unit: "GRAM" }, 4, 1), 5);
  assert.equal(roundQuantity(1.234, "LITER"), 1.23);
  assert.equal(roundQuantity(2.01, "BOX"), 3);
  assert.equal(roundQuantity(4, "PACK"), 4);
});

test("perPerson: each person's amount is rounded up first, then x people", () => {
  assert.equal(scaleQuantity({ name: "Trứng gà", quantity: 3, unit: "PIECE", perPerson: true }, 2, 3), 6);
  assert.equal(scaleQuantity({ name: "Trứng gà", quantity: 3, unit: "PIECE" }, 2, 3), 5, "a normal ingredient is rounded once");
  assert.equal(scaleQuantity({ name: "Sữa tươi", quantity: 300, unit: "MILLILITER", perPerson: true }, 2, 4), 600);
  assert.equal(scaleQuantity({ name: "Bánh mì", quantity: 2, unit: "PIECE", perPerson: true }, 2, 1), 1);
});

test("seasonings scale the same way; free-text amounts stay as text", () => {
  const [salt, fishSauce] = scaleIngredients([
    { name: "Muối", quantity: null, unit: null, note: "vừa ăn", isSeasoning: true },
    { name: "Nước mắm", quantity: 30, unit: "MILLILITER", isSeasoning: true },
  ], 2, 4);
  assert.deepEqual(salt, { name: "Muối", quantity: null, unit: null, note: "vừa ăn", isSeasoning: true });
  assert.equal(fishSauce.quantity, 60);
});

test("servings fallback: recipe servings null / 0 -> 1; menu people from servings, else member count, else 1", () => {
  assert.equal(recipeServings(null), 1);
  assert.equal(recipeServings(0), 1);
  assert.equal(scaleQuantity({ name: "Thịt", quantity: 100, unit: "GRAM" }, 0, 4), 400);
  assert.equal(menuPeople(2, 4), 2);
  assert.equal(menuPeople(null, 4), 4, "older menus without servings use the current member count");
  assert.equal(menuPeople(undefined, undefined), 1);
});

function captureClient() {
  const created: Array<{ data: { servings: number | null; items: { create: Array<{ details: { availableCount: number; totalCount: number; missingIngredients: Array<{ name: string; quantity: number | null; unit: string | null }>; reason: string } }> } } }> = [];
  const menu = {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async (args: (typeof created)[number]) => { created.push(args); return args.data; },
  };
  const client = { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
  return { client, first: () => created[0].data };
}

test("Kho matching, Có sẵn X/Y and the missing list use the family's amounts", async () => {
  const recipes = [{ id: "ga", name: "Gà luộc", role: "man", mealTypes: ["lunch"], servings: 2, ingredientDetails: [{ name: "Thịt gà", quantity: 300, unit: "GRAM" }] }];
  const kho = [{ name: "Thịt gà", quantity: 400, unit: "GRAM" }];
  const day = new Date("2026-11-24T00:00:00.000Z");
  const run = async (owner: { userId: string; familyId: string | null; memberCount?: number }) => {
    const { client, first } = captureClient();
    await generateMenu({ userId: owner.userId, owner, periodType: PeriodType.DAY, startDate: day, endDate: day, preferences: { mealTypes: ["LUNCH"] }, recipes, inventoryItems: kho }, client);
    return first();
  };

  // Family of 4: 600 g needed, 400 g in Kho -> not available, 200 g missing (what goes to the cart).
  const family = await run({ userId: "u1", familyId: "f1", memberCount: 4 });
  assert.equal(family.servings, 4);
  const familyDish = family.items.create[0].details;
  assert.equal(familyDish.availableCount, 0);
  assert.deepEqual(familyDish.missingIngredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })), [{ name: "Thịt gà", quantity: 200, unit: "GRAM" }]);

  // Alone: 150 g needed, 400 g in Kho -> "Có sẵn 1/1", nothing missing.
  const single = await run({ userId: "u2", familyId: null });
  assert.equal(single.servings, 1);
  const singleDish = single.items.create[0].details;
  assert.equal(singleDish.availableCount, 1);
  assert.deepEqual(singleDish.missingIngredients, []);
  assert.match(singleDish.reason, /Có sẵn 1\/1/);
});
