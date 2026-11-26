/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductNamed, catalogUnitForName } from "./catalogSuggest";
import type { CatalogIngredient } from "./inventoryApi";

const product = (name: string, unit: string) => ({ id: name, name, group: "Rau củ", unit, shelfLifeDays: 7, imageUrl: null, discountPercent: null, promoEndDate: null, price: null }) as CatalogIngredient;
const catalog = [product("Cà rốt", "KILOGRAM"), product("Mì gói", "PACK"), product("Trứng gà", "PIECE"), product("Nấm lạ", "bó nhỏ")];

test("photo suggestion / typed name: the add form defaults to the product's sale unit", () => {
  assert.equal(catalogUnitForName(catalog, "Cà rốt"), "KILOGRAM");
  assert.equal(catalogUnitForName(catalog, "ca rot"), "KILOGRAM");
  assert.equal(catalogUnitForName(catalog, "  MÌ GÓI "), "PACK");
  assert.equal(catalogUnitForName(catalog, "Trứng gà"), "PIECE");
});

test("no default when the name is not exactly a catalog product or its unit is unknown", () => {
  assert.equal(catalogUnitForName(catalog, "Cà"), null);
  assert.equal(catalogUnitForName(catalog, "Cà rốt Đà Lạt"), null);
  assert.equal(catalogUnitForName(catalog, ""), null);
  assert.equal(catalogUnitForName(catalog, "Nấm lạ"), null);
  assert.equal(catalogProductNamed(catalog, "ca rot")?.name, "Cà rốt");
});
