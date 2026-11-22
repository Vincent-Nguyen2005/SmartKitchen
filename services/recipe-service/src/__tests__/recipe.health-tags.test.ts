import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { fillHealthTags, healthTagsFor } from "../seed/health-tags";

test("rules: catalog names from ingredients and the dish name; accents kept for whole words", () => {
  assert.deepEqual(healthTagsFor({ name: "Tôm rim", role: "man", ingredientNames: ["Tôm", "Nước mắm", "Đường"] }),
    { allergens: ["Tôm", "Hải sản"], contraindications: ["Cao huyết áp", "Gout"] });
  // "Cà chua" is not fish; "Mì chính" is not wheat; soy milk is not dairy.
  assert.deepEqual(healthTagsFor({ name: "Canh cà", role: "canh", ingredientNames: ["Cà chua", "Mì chính"] }), { allergens: [], contraindications: [] });
  assert.deepEqual(healthTagsFor({ name: "Sữa đậu nành", role: "do_uong", ingredientNames: ["Đậu nành", "Đường"] }),
    { allergens: ["Đậu nành"], contraindications: ["Tiểu đường"] });
  assert.deepEqual(healthTagsFor({ name: "Cá chiên giòn", role: "man", ingredientNames: ["Cá basa", "Bột chiên giòn"] }),
    { allergens: ["Cá", "Gluten"], contraindications: ["Mỡ máu cao"] });
});

type Row = { id: string; name: string; role: string | null; ingredients: string[]; ingredientDetails: unknown; allergens: string[]; contraindications: string[] };

function fakeClient(rows: Row[]) {
  let updates = 0;
  const client = {
    recipe: {
      findMany: async () => rows.map((row) => ({ ...row })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        updates += 1;
        Object.assign(rows.find((row) => row.id === where.id)!, data);
        return {};
      },
    },
  } as unknown as PrismaClient;
  return { client, updates: () => updates };
}

test("fill: only empty fields of starter dishes; admin tags untouched; a second run changes nothing", async () => {
  const rows: Row[] = [
    { id: "1", name: "Tôm rim", role: "man", ingredients: ["Tôm"], ingredientDetails: [{ name: "Tôm" }, { name: "Nước mắm", isSeasoning: true }], allergens: [], contraindications: [] },
    // Admin-edited allergens stay; only the empty contraindications are filled.
    { id: "2", name: "Cá kho tộ", role: "man", ingredients: ["Cá basa"], ingredientDetails: [{ name: "Cá basa" }], allergens: ["tôi chọn"], contraindications: [] },
    // Both fields edited by an admin: untouched.
    { id: "3", name: "Bò kho", role: "man", ingredients: ["Thịt bò"], ingredientDetails: [{ name: "Thịt bò" }], allergens: ["x"], contraindications: ["y"] },
    // Not a starter dish: untouched.
    { id: "4", name: "Tôm hùm nướng", role: "man", ingredients: ["Tôm hùm"], ingredientDetails: [], allergens: [], contraindications: [] },
  ];
  const { client, updates } = fakeClient(rows);
  const report = await fillHealthTags(client);
  assert.deepEqual(report, [
    { name: "Tôm rim", allergens: ["Tôm", "Hải sản"], contraindications: ["Cao huyết áp", "Gout"] },
    { name: "Cá kho tộ", contraindications: ["Cao huyết áp"] },
  ]);
  assert.deepEqual(rows[1].allergens, ["tôi chọn"]);
  assert.deepEqual([rows[2].allergens, rows[2].contraindications], [["x"], ["y"]]);
  assert.deepEqual([rows[3].allergens, rows[3].contraindications], [[], []]);
  assert.equal(updates(), 2);
  assert.deepEqual(await fillHealthTags(client), []);
  assert.equal(updates(), 2, "idempotent");
});
