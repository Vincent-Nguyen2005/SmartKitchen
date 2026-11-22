import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { fillPerPerson } from "../seed/per-person";
import { createRecipeSchema } from "../services/recipe.service";

type Row = { id: string; name: string; ingredientDetails: Array<Record<string, unknown>> | null };

function fakeClient(rows: Row[]) {
  let updates = 0;
  const client = {
    recipe: {
      findMany: async () => rows.map((row) => ({ ...row })),
      update: async ({ where, data }: { where: { id: string }; data: { ingredientDetails: Row["ingredientDetails"] } }) => {
        updates += 1;
        rows.find((row) => row.id === where.id)!.ingredientDetails = data.ingredientDetails;
        return {};
      },
    },
  } as unknown as PrismaClient;
  return { client, updates: () => updates };
}

test("perPerson is accepted on ingredients", () => {
  const parsed = createRecipeSchema.parse({ name: "Bánh mì", ingredientDetails: [{ name: "Bánh mì", quantity: 1, unit: "PIECE", perPerson: true }] });
  assert.equal(parsed.ingredientDetails?.[0].perPerson, true);
});

test("fillPerPerson: only unset flags on listed starter ingredients; admin choices kept; idempotent", async () => {
  const rows: Row[] = [
    { id: "1", name: "Bánh mì trứng ốp la", ingredientDetails: [{ name: "Bánh mì", quantity: 2, unit: "PIECE" }, { name: "Trứng gà", quantity: 4, unit: "PIECE" }, { name: "Dưa leo", quantity: 1, unit: "PIECE" }] },
    // The admin turned it off: stays off.
    { id: "2", name: "Bánh mì chảo", ingredientDetails: [{ name: "Bánh mì", quantity: 2, unit: "PIECE", perPerson: false }, { name: "Trứng gà", quantity: 2, unit: "PIECE", perPerson: false }] },
    { id: "3", name: "Phở bò", ingredientDetails: [{ name: "Bánh phở", quantity: 400, unit: "GRAM" }] },
  ];
  const { client, updates } = fakeClient(rows);
  assert.equal(await fillPerPerson(client), 1);
  assert.deepEqual(rows[0].ingredientDetails!.map((entry) => entry.perPerson), [true, true, undefined]);
  assert.deepEqual(rows[1].ingredientDetails!.map((entry) => entry.perPerson), [false, false]);
  assert.equal(rows[2].ingredientDetails![0].perPerson, undefined);
  assert.equal(await fillPerPerson(client), 0);
  assert.equal(updates(), 1);
});
