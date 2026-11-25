/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { matchesSearch, neededProductIds, orderNeededFirst } from "./neededFirst";

const product = (id: string, name: string) => ({ id, name });

test("needed ids: the weekly list's order, each product once, items not sold in Đi chợ left out", () => {
  const ids = neededProductIds([
    { productId: "p-pork" }, { productId: "p-scallion" }, { productId: null }, { productId: "p-pork" }, { productId: "p-egg" },
  ]);
  assert.deepEqual(ids, ["p-pork", "p-scallion", "p-egg"]);
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
