/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { conditionText, emptyForm, formErrors, formFromPromotion, parseAmount, periodText, scopeText, serverFieldErrors, STATUS_LABELS, toPayload, valueText, type CheckoutPromotion, type PromotionForm } from "./promotions";

const TODAY = "2026-11-27";
const form = (patch: Partial<PromotionForm> = {}): PromotionForm => ({ ...emptyForm(TODAY), name: "Giảm 10% đơn từ 200.000đ", value: "10", ...patch });

test("a new form starts today and ends a week later, on the whole order, percent, active", () => {
  assert.deepEqual(emptyForm(TODAY), { name: "", scope: "ORDER", groups: [], productIds: [], type: "PERCENT", value: "", maxDiscount: "", minSubtotal: "", startDate: "2026-11-27", endDate: "2026-12-04", usageLimit: "", isActive: true });
});

test("validation: name, percent 1-100, amount from 1.000đ, cap, groups / products, dates, usage limit", () => {
  assert.deepEqual(formErrors(form(), { isNew: true, today: TODAY }), {});
  assert.equal(formErrors(form({ name: "  " }), { isNew: true, today: TODAY }).name, "Nhập tên chương trình");
  assert.equal(formErrors(form({ value: "0" }), { isNew: true, today: TODAY }).value, "Phần trăm từ 1 đến 100");
  assert.equal(formErrors(form({ value: "101" }), { isNew: true, today: TODAY }).value, "Phần trăm từ 1 đến 100");
  assert.equal(formErrors(form({ type: "AMOUNT", value: "500" }), { isNew: true, today: TODAY }).value, "Số tiền giảm từ 1.000đ");
  assert.deepEqual(formErrors(form({ type: "AMOUNT", value: "20.000" }), { isNew: true, today: TODAY }), {});
  assert.equal(formErrors(form({ maxDiscount: "500" }), { isNew: true, today: TODAY }).maxDiscount, "Giảm tối đa từ 1.000đ");
  assert.equal(formErrors(form({ scope: "GROUP" }), { isNew: true, today: TODAY }).groups, "Chọn ít nhất một nhóm");
  assert.equal(formErrors(form({ scope: "PRODUCTS" }), { isNew: true, today: TODAY }).productIds, "Chọn ít nhất một sản phẩm");
  assert.equal(formErrors(form({ startDate: "2026-12-10", endDate: "2026-12-01" }), { isNew: true, today: TODAY }).endDate, "Ngày kết thúc phải từ ngày bắt đầu trở đi");
  assert.equal(formErrors(form({ startDate: "2026-11-01", endDate: "2026-11-20" }), { isNew: true, today: TODAY }).endDate, "Ngày kết thúc phải từ hôm nay trở đi");
  // Editing an ended promotion is allowed (e.g. to look at or rename it).
  assert.equal(formErrors(form({ startDate: "2026-11-01", endDate: "2026-11-20" }), { isNew: false, today: TODAY }).endDate, undefined);
  assert.equal(formErrors(form({ usageLimit: "0" }), { isNew: true, today: TODAY }).usageLimit, "Từ 1 đến 1000 lần");
  assert.equal(formErrors(form({ minSubtotal: "abc" }), { isNew: true, today: TODAY }).minSubtotal, "Nhập số tiền");
});

test("amounts accept dots and đ; the payload clears fields that do not apply", () => {
  assert.equal(parseAmount("200.000đ"), 200_000);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("abc") as number));
  assert.deepEqual(toPayload(form({ type: "AMOUNT", value: "20.000", maxDiscount: "50.000", minSubtotal: "150.000", scope: "ORDER", groups: ["Thịt"], usageLimit: "2" })), {
    name: "Giảm 10% đơn từ 200.000đ", scope: "ORDER", groups: [], productIds: [], type: "AMOUNT", value: 20_000, maxDiscount: null, minSubtotal: 150_000,
    startDate: "2026-11-27", endDate: "2026-12-04", usageLimitPerUser: 2, isActive: true,
  });
});

test("server field errors land on the form fields", () => {
  assert.deepEqual(serverFieldErrors({ fieldErrors: { endDate: ["Ngày kết thúc phải từ ngày bắt đầu trở đi"], usageLimitPerUser: ["Số lần mỗi người từ 1 đến 1000"] } }),
    { endDate: "Ngày kết thúc phải từ ngày bắt đầu trở đi", usageLimit: "Số lần mỗi người từ 1 đến 1000" });
  assert.deepEqual(serverFieldErrors(null), {});
});

test("list texts and status labels", () => {
  const promotion: CheckoutPromotion = { id: "p1", name: "Rau củ giảm 15%", scope: "GROUP", groups: ["Rau củ", "Trái cây"], productIds: [], type: "PERCENT", value: 15, maxDiscount: 30_000, minSubtotal: 100_000, startDate: "2026-12-01", endDate: "2026-12-31", usageLimitPerUser: 2, isActive: true, status: "UPCOMING" };
  assert.equal(valueText(promotion), "Giảm 15% · tối đa 30.000đ");
  assert.equal(valueText({ type: "AMOUNT", value: 20_000, maxDiscount: null }), "Giảm 20.000đ");
  assert.equal(scopeText(promotion), "Nhóm: Rau củ, Trái cây");
  assert.equal(scopeText({ scope: "PRODUCTS", groups: [], productIds: ["a", "b", "c"] }), "3 sản phẩm");
  assert.equal(conditionText(promotion), "Đơn từ 100.000đ · 2 lần/người");
  assert.equal(conditionText({ minSubtotal: null, usageLimitPerUser: null }), "");
  assert.equal(periodText(promotion.startDate, promotion.endDate), "01/12/2026 – 31/12/2026");
  assert.deepEqual(Object.values(STATUS_LABELS).map((entry) => entry.label), ["Đang chạy", "Sắp diễn ra", "Hết hạn", "Tắt"]);
  assert.deepEqual(formFromPromotion(promotion), { name: "Rau củ giảm 15%", scope: "GROUP", groups: ["Rau củ", "Trái cây"], productIds: [], type: "PERCENT", value: "15", maxDiscount: "30000", minSubtotal: "100000", startDate: "2026-12-01", endDate: "2026-12-31", usageLimit: "2", isActive: true });
});
