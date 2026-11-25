/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cookLines, cookSummary, newCookId } from "./cookFromKho";

test("cook lines: measured ingredients only (no seasonings, no free-text amounts), the same one summed", () => {
  const lines = cookLines([
    { name: "Thịt heo", quantity: 300, unit: "GRAM" },
    { name: "Nước mắm", quantity: 30, unit: "MILLILITER", isSeasoning: true },
    { name: "Muối", quantity: null, unit: null },
    { name: "Hành lá", quantity: 0, unit: "GRAM" },
    { name: "thịt heo", quantity: 200, unit: "gram" },
    { name: "Trứng gà", quantity: 3, unit: "PIECE" },
  ]);
  assert.deepEqual(lines, [{ name: "Thịt heo", quantity: 500, unit: "GRAM" }, { name: "Trứng gà", quantity: 3, unit: "PIECE" }]);
});

test("cook id: a v4 UUID", () => {
  assert.match(newCookId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newCookId(), newCookId());
});

test("summary names what Kho could not cover", () => {
  assert.equal(cookSummary([{ name: "Thịt heo", missing: 0 }]), "Đã trừ nguyên liệu trong Kho");
  assert.equal(cookSummary([{ name: "Thịt heo", missing: 0.2 }, { name: "Tôm", missing: 100 }]), "Đã trừ trong Kho; Kho không đủ: Thịt heo, Tôm");
});
