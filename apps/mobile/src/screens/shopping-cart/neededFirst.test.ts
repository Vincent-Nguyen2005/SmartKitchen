import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearch, neededLabels, orderNeededFirst, type NeededItem } from "./neededFirst";

const item = (overrides: Partial<NeededItem>): NeededItem => ({ productId: null, quantity: 1, unit: "GRAM", saleUnit: null, cartQuantity: null, unitMismatch: false, ...overrides });
const product = (id: string, name: string) => ({ id, name });

test("labels: what the cart would get in the sale unit, first row per product, in the weekly order", () => {
  const labels = neededLabels([
    item({ productId: "p-pork", quantity: 650, unit: "GRAM", saleUnit: "KILOGRAM", cartQuantity: 0.7 }),
    item({ productId: "p-scallion", quantity: 150, unit: "GRAM", saleUnit: "PACK", cartQuantity: 2 }),
    item({ productId: "p-egg", quantity: 3, unit: "PIECE", saleUnit: "PIECE", saleUnitLabel: "quả", cartQuantity: 3 }),
    item({ productId: "p-pork", quantity: 2, unit: "PIECE", saleUnit: "KILOGRAM", cartQuantity: 1, unitMismatch: true }),
    item({ productId: "p-carrot", quantity: 2, unit: "PIECE", saleUnit: "KILOGRAM", cartQuantity: 1, unitMismatch: true }),
    item({ productId: null, quantity: 50, unit: "GRAM" }),
  ]);
  assert.deepEqual([...labels], [["p-pork", "Thiếu 0,7 kg"], ["p-scallion", "Thiếu 2 gói"], ["p-egg", "Thiếu 3 quả"], ["p-carrot", "Thiếu 2 cái"]]);
});

test("needed products first in the weekly order, then the rest in their order, without duplicates", () => {
  const needed = [product("c", "Cà rốt"), product("a", "Thịt heo")];
  const rest = [product("a", "Thịt heo"), product("b", "Bưởi"), product("c", "Cà rốt"), product("d", "Dứa"), product("b", "Bưởi")];
  assert.deepEqual(orderNeededFirst(needed, ["a", "c"], rest).map((entry) => entry.id), ["a", "c", "b", "d"]);
});

test("search keeps the same order: matching needed products first, others still found in the rest", () => {
  const needed = [product("a", "Thịt heo"), product("c", "Cà rốt")];
  const rest = [product("e", "Thịt bò"), product("a", "Thịt heo")];
  assert.deepEqual(orderNeededFirst(needed, ["a", "c"], rest, "thit").map((entry) => entry.id), ["a", "e"]);
  assert.equal(matchesSearch("Cà rốt", "ca rot"), true);
  assert.equal(matchesSearch("Đậu phụ", "dau"), true);
  assert.equal(matchesSearch("Bưởi", "cam"), false);
});

test("no weekly list (no family or the call failed): the normal order", () => {
  const rest = [product("b", "Bưởi"), product("d", "Dứa")];
  assert.deepEqual(orderNeededFirst([], [], rest), rest);
});
