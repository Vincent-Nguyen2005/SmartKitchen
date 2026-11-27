/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_SECTIONS, adminSectionMemory, isAdminSection, LOGOUT_CONFIRM, LOGOUT_LABEL } from "./adminSections";

test("one tab bar: five sections in order, no Báo cáo (no user / shipper entry point), 'Giao hàng' as the tab label", () => {
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.label), ["Tổng quan", "Nguyên liệu", "Món ăn", "Khuyến mãi", "Giao hàng"]);
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.key), ["dashboard", "ingredients", "recipes", "promotions", "shippers"]);
  for (const gone of ["Báo cáo", "Thống kê", "Quản trị", "Giảm giá tự động", "Người giao hàng"]) assert.equal(ADMIN_SECTIONS.some((section) => section.label === gone), false);
});

test("the selected tab is remembered across remounts; unknown values (old 'overview', 'dailyDeals', 'reports') fall back to Tổng quan", () => {
  assert.equal(adminSectionMemory.get(), "dashboard");
  assert.equal(adminSectionMemory.set("promotions"), "promotions");
  assert.equal(adminSectionMemory.get(), "promotions");
  assert.equal(adminSectionMemory.set("overview"), "dashboard");
  assert.equal(adminSectionMemory.set("dailyDeals"), "dashboard");
  assert.equal(adminSectionMemory.set("reports"), "dashboard");
  assert.equal(isAdminSection("shippers"), true);
  assert.equal(isAdminSection("admin"), false);
});

test("Đăng xuất: a tab-style item after the five sections, with an in-app confirm (Hủy / Đăng xuất, destructive)", () => {
  assert.equal(LOGOUT_LABEL, "Đăng xuất");
  assert.deepEqual(LOGOUT_CONFIRM, { title: "Đăng xuất khỏi tài khoản quản trị?", cancelLabel: "Hủy", confirmLabel: "Đăng xuất", destructive: true });
  assert.equal(ADMIN_SECTIONS.length + 1, 6);
});
