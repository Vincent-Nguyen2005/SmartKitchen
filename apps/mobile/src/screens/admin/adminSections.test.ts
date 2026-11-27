/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_SECTIONS, adminSectionMemory, isAdminSection } from "./adminSections";

test("one tab bar: six sections in order, 'Giao hàng' as the tab label, no Thống kê / Quản trị / Giảm giá tự động tab", () => {
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.label), ["Tổng quan", "Báo cáo", "Nguyên liệu", "Món ăn", "Khuyến mãi", "Giao hàng"]);
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.key), ["dashboard", "reports", "ingredients", "recipes", "promotions", "shippers"]);
  for (const gone of ["Thống kê", "Quản trị", "Giảm giá tự động", "Người giao hàng"]) assert.equal(ADMIN_SECTIONS.some((section) => section.label === gone), false);
});

test("the selected tab is remembered across remounts; unknown values (old 'overview', 'dailyDeals') fall back to Tổng quan", () => {
  assert.equal(adminSectionMemory.get(), "dashboard");
  assert.equal(adminSectionMemory.set("promotions"), "promotions");
  assert.equal(adminSectionMemory.get(), "promotions");
  assert.equal(adminSectionMemory.set("overview"), "dashboard");
  assert.equal(adminSectionMemory.set("dailyDeals"), "dashboard");
  assert.equal(isAdminSection("shippers"), true);
  assert.equal(isAdminSection("admin"), false);
});
