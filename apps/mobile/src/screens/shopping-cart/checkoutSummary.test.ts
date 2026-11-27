/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cartPromotionLine, orderTotals, previewTotals, summaryRows, totalChangedText } from "./checkoutSummary";

const preview = { subtotal: 186_000, promotion: { id: "p1", name: "Giảm 10%", discount: 15_000 }, discount: 15_000, total: 171_000, hint: null };

test("checkout rows: Tạm tính, Khuyến mãi (success colour, minus sign), Tổng thanh toán", () => {
  assert.deepEqual(summaryRows(previewTotals(preview)), [
    { key: "subtotal", label: "Tạm tính", value: "186.000đ" },
    { key: "promotion", label: "Khuyến mãi: Giảm 10%", value: "−15.000đ", tone: "success" },
    { key: "total", label: "Tổng thanh toán", value: "171.000đ", strong: true },
  ]);
});

test("no promotion: only the total (Tạm tính on request); the shipper's label", () => {
  const plain = { ...preview, promotion: null, discount: 0, total: 186_000 };
  assert.deepEqual(summaryRows(previewTotals(plain)).map((row) => row.key), ["total"]);
  assert.deepEqual(summaryRows(previewTotals(plain), { alwaysSubtotal: true }).map((row) => row.key), ["subtotal", "total"]);
  assert.equal(summaryRows(orderTotals({ total: 171_000, subtotal: 186_000, promotionName: "Giảm 10%", discountAmount: 15_000 }), { totalLabel: "Tổng tiền cần thu" }).at(-1)?.label, "Tổng tiền cần thu");
});

test("older orders without the new fields: subtotal = total, no promotion row", () => {
  assert.deepEqual(orderTotals({ total: 50_000 }), { subtotal: 50_000, discount: 0, promotionName: null, total: 50_000 });
  assert.deepEqual(summaryRows(orderTotals({ total: 50_000, subtotal: 0 })).map((row) => row.key), ["total"]);
});

test("Giỏ hàng line under the total: promotion, else the hint, else nothing", () => {
  assert.deepEqual(cartPromotionLine(preview), { text: "Khuyến mãi: Giảm 10% −15.000đ", tone: "success" });
  const close = { ...preview, promotion: null, discount: 0, hint: { name: "X", missing: 30_000, text: "Mua thêm 30.000đ để được X" } };
  assert.deepEqual(cartPromotionLine(close), { text: "Mua thêm 30.000đ để được X", tone: "hint" });
  assert.equal(cartPromotionLine({ ...preview, promotion: null, discount: 0 }), null);
  assert.equal(cartPromotionLine(null), null);
});

test("re-validation notice names both totals", () => {
  assert.equal(totalChangedText(186_000, 171_000), "Tổng thanh toán đã thay đổi từ 186.000đ thành 171.000đ. Kiểm tra lại rồi bấm Đặt hàng.");
});
