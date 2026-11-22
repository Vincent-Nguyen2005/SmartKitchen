import assert from "node:assert/strict";
import test from "node:test";
import { MealType, PeriodType, type PrismaClient } from "../../node_modules/.prisma/client-menu";
import { generateMenu } from "../services/menu.service";
import { parseDishes } from "../services/ai/gemini";

type Created = { recipeId: string; mealType: MealType; details: { availableCount: number; totalCount: number; missingIngredients: Array<{ name: string }>; reason: string } };

function client() {
  const created: Array<{ data: { items: { create: Created[] } } }> = [];
  const menu = { findMany: async () => [], deleteMany: async () => ({ count: 0 }), create: async (args: (typeof created)[number]) => { created.push(args); return args; } };
  return { created, client: { menu, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient };
}

const seasoned = (id: string, main: string[], seasonings: string[]) => ({
  id, name: id, mealTypes: [] as string[], calories: 300,
  ingredientDetails: [
    ...main.map((name) => ({ name, quantity: null, unit: null })),
    ...seasonings.map((name) => ({ name, quantity: null, unit: null, note: "vừa ăn", isSeasoning: true })),
  ],
});

test("seasonings are not counted: availability, score and missing list use the main ingredients only", async () => {
  const { created, client: db } = client();
  await generateMenu({
    userId: "u1", periodType: PeriodType.DAY, startDate: new Date("2026-11-24T00:00:00Z"), endDate: new Date("2026-11-24T00:00:00Z"),
    preferences: { mealTypes: ["lunch"] },
    // Kho has the eggs but none of the seasonings.
    inventoryItems: [{ name: "Trứng gà", quantity: 6, unit: "PIECE" }, { name: "Cà chua", quantity: 2, unit: "PIECE" }],
    recipes: [
      // 2/2 main ingredients in Kho, 5 seasonings not in Kho.
      seasoned("trungxao", ["Trứng gà", "Cà chua"], ["Muối", "Nước mắm", "Đường", "Tiêu", "Dầu ăn"]),
      // 1/2 main ingredients in Kho and no seasonings: must still rank lower.
      seasoned("canhca", ["Cà chua", "Cá basa"], []),
    ],
  }, db);
  const [item] = created[0].data.items.create;
  assert.equal(item.recipeId, "trungxao");
  assert.equal(item.details.availableCount, 2);
  assert.equal(item.details.totalCount, 2);
  assert.equal(item.details.reason, "Có sẵn 2/2 nguyên liệu");
  assert.deepEqual(item.details.missingIngredients, []);
});

test("AI dishes: seasoning ingredients keep isSeasoning and are never 'from Kho'", () => {
  const text = JSON.stringify({ dishes: [{
    name: "Trứng chiên", mealType: "sang", servings: 2, totalMinutes: 10,
    ingredients: [{ name: "Trứng gà", quantity: 3, unit: "PIECE", fromKho: true }, { name: "Nước mắm", quantity: null, unit: null, fromKho: true, isSeasoning: true }],
    steps: [{ instruction: "Chiên trứng", durationSeconds: 180 }],
  }] });
  const [dish] = parseDishes(text, [{ name: "Trứng", quantity: 6, unit: "PIECE", expiringSoon: false }, { name: "Nước mắm", quantity: 1, unit: "BOTTLE", expiringSoon: false }], "ai");
  assert.deepEqual(dish.ingredients.map((entry) => [entry.name, entry.fromKho, entry.isSeasoning]), [["Trứng gà", true, false], ["Nước mắm", false, true]]);
});
