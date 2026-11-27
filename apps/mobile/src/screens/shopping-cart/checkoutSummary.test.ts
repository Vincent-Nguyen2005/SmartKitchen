/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { cartSummary, orderTotals, previewTotals, summaryRows, totalChangedText } from "./checkoutSummary";

const preview = { subtotal: 186_000, promotion: { id: "p1", name: "Giảm 10%", discount: 15_000 }, discount: 15_000, total: 171_000, hint: null };

test("checkout rows: Tạm tính, Khuyến mãi (success colour, minus sign), Tổng thanh toán", () => {
  assert.deepEqual(summaryRows(previewTotals(preview)), [
    { key: "subtotal", label: "Tạm tính", value: "186.000đ" },
    { key: "promotion", label: "Khuyến mãi: Giảm 10%", value: "−15.000đ", tone: "success" },
    { key: "total", label: "Tổng thanh toán", value: "171.000đ", strong: true },
  ]);
});

test("no promotion: only the total; the shipper's label", () => {
  const plain = { ...preview, promotion: null, discount: 0, total: 186_000 };
  assert.deepEqual(summaryRows(previewTotals(plain)).map((row) => row.key), ["total"]);
  assert.equal(summaryRows(orderTotals({ total: 171_000, subtotal: 186_000, promotionName: "Giảm 10%", discountAmount: 15_000 }), { totalLabel: "Tổng tiền cần thu" }).at(-1)?.label, "Tổng tiền cần thu");
});

test("older orders without the new fields: subtotal = total, no promotion row", () => {
  assert.deepEqual(orderTotals({ total: 50_000 }), { subtotal: 50_000, discount: 0, promotionName: null, total: 50_000 });
  assert.deepEqual(summaryRows(orderTotals({ total: 50_000, subtotal: 0 })).map((row) => row.key), ["total"]);
});

test("Giỏ hàng summary = the checkout sheet's rows: Tạm tính, Khuyến mãi (success), Tổng thanh toán (bold, discounted)", () => {
  const summary = cartSummary(preview, 186_000);
  assert.deepEqual(summary.rows, summaryRows(previewTotals(preview)));
  assert.deepEqual(summary.rows.map((row) => [row.label, row.value, row.tone ?? null, row.strong ?? false]), [
    ["Tạm tính", "186.000đ", null, false],
    ["Khuyến mãi: Giảm 10%", "−15.000đ", "success", false],
    ["Tổng thanh toán", "171.000đ", null, true],
  ]);
  assert.equal(summary.hint, null);
});

test("Giỏ hàng without a promotion (the default, promotions off): only Tổng thanh toán, no Khuyến mãi / Tạm tính / hint", () => {
  const none = { ...preview, promotion: null, discount: 0, total: 186_000, hint: null };
  const summary = cartSummary(none, 186_000);
  assert.deepEqual(summary.rows.map((row) => [row.label, row.value]), [["Tổng thanh toán", "186.000đ"]]);
  assert.equal(summary.hint, null);
  // A hint (only possible with promotions on) still shows under the total.
  assert.equal(cartSummary({ ...none, hint: { text: "Mua thêm 30.000đ để được X" } }, 186_000).hint, "Mua thêm 30.000đ để được X");
});

test("Giỏ hàng before the server's preview arrives (or when it fails): the cart's own total", () => {
  const summary = cartSummary(null, 99_500);
  assert.deepEqual(summary.rows.map((row) => [row.key, row.value]), [["total", "99.500đ"]]);
  assert.equal(summary.hint, null);
});

test("re-validation notice names both totals", () => {
  assert.equal(totalChangedText(186_000, 171_000), "Tổng thanh toán đã thay đổi từ 186.000đ thành 171.000đ. Kiểm tra lại rồi bấm Đặt hàng.");
});

test("orders, shipper receipt and Chi tiêu: no promotion → no Khuyến mãi or Tạm tính row", () => {
  assert.deepEqual(summaryRows(orderTotals({ total: 171_000, subtotal: 171_000, promotionName: null, discountAmount: 0 }), { totalLabel: "Tổng tiền cần thu" }).map((row) => row.label), ["Tổng tiền cần thu"]);
});
