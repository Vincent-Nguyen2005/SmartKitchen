/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cartLines, isPurchasable, missingLine, skipNote, type WeekMissingItem } from "./weekShopping";

const item = (extra: Partial<WeekMissingItem>): WeekMissingItem => ({
  name: "Cà chua", quantity: 6, unit: "KILOGRAM", productId: "p-tomato", imageUrl: null, price: 30000, discountPercent: null,
  saleUnit: "KILOGRAM", saleUnitLabel: null, cartQuantity: 6, unconverted: false, unitMismatch: false, ...extra,
});

test("one line per card: the missing amount in the sale unit, with the product's own word", () => {
  assert.equal(missingLine(item({})), "Thiếu 6 kg");
  assert.equal(missingLine(item({ name: "Cà rốt", quantity: 1.5, cartQuantity: 1.5 })), "Thiếu 1,5 kg");
  assert.equal(missingLine(item({ name: "Bún", quantity: 2, unit: "PACK", saleUnit: "PACK", cartQuantity: 2 })), "Thiếu 2 gói");
  assert.equal(missingLine(item({ name: "Trứng gà", quantity: 20, unit: "PIECE", saleUnit: "PIECE", saleUnitLabel: "quả", cartQuantity: 20 })), "Thiếu 20 quả");
  assert.equal(missingLine(item({ name: "Bông cải xanh", quantity: 6, unit: "PIECE", saleUnit: "PIECE", saleUnitLabel: "cái", cartQuantity: 6 })), "Thiếu 6 cái");
  // Not convertible: the recipe unit, never the sale unit's word.
  assert.equal(missingLine(item({ name: "Dưa leo", quantity: 3, unit: "PIECE", cartQuantity: null, unconverted: true })), "Thiếu 3 cái");
  assert.equal(missingLine(item({ name: "Hủ tiếu", quantity: 400, unit: "GRAM", saleUnit: "PACK", cartQuantity: null, unconverted: true })), "Thiếu 400 g");
});

test("no 'Mua …' line: a note only for items the cart button skips", () => {
  assert.equal(skipNote(item({})), null);
  assert.deepEqual(skipNote(item({ productId: null, saleUnit: null, cartQuantity: null })), { text: "Chưa có bán", warning: true });
  assert.deepEqual(skipNote(item({ cartQuantity: null, unconverted: true, unit: "PIECE", quantity: 3 })), { text: "Chưa đổi được sang đơn vị bán", warning: false });
  assert.deepEqual(skipNote(item({ cartQuantity: null, unconverted: true, unitMismatch: true })), { text: "Kho có nhưng khác đơn vị", warning: false });
});

test("Thêm vào Giỏ hàng adds exactly the shown amount, only for sold and converted items", () => {
  const items = [
    item({}),
    item({ name: "Bún", productId: "p-bun", quantity: 2, unit: "PACK", saleUnit: "PACK", cartQuantity: 2, price: 12000 }),
    item({ name: "Lá lốt", productId: null, saleUnit: null, cartQuantity: null, quantity: 50, unit: "GRAM" }),
    item({ name: "Dưa leo", productId: "p-cucumber", cartQuantity: null, unconverted: true, quantity: 3, unit: "PIECE" }),
  ];
  assert.deepEqual(items.map(isPurchasable), [true, true, false, false]);
  const lines = cartLines(items);
  assert.deepEqual(lines.map((line) => [line.name, line.quantity, line.unit, line.productId]), [["Cà chua", 6, "KILOGRAM", "p-tomato"], ["Bún", 2, "PACK", "p-bun"]]);
  // The shown amount and the cart amount are the same number.
  for (const line of lines) assert.equal(line.quantity, items.find((entry) => entry.name === line.name)?.quantity);
});
