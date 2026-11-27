/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { countNewUsers, OVERVIEW_CARDS } from "./overviewStats";

const NOW = Date.parse("2026-11-27T05:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

test("overview: one card with three short columns — users, families, new in 7 days (no system status, services or reports)", () => {
  assert.deepEqual(OVERVIEW_CARDS.map((card) => card.label), ["Người dùng", "Gia đình", "Mới (7 ngày)"]);
  assert.ok(OVERVIEW_CARDS.every((card) => card.label.length <= 12));
  for (const gone of ["Trạng thái hệ thống", "Dịch vụ có vấn đề", "Báo cáo chờ xử lý"]) assert.equal(OVERVIEW_CARDS.some((card) => card.label === gone), false);
});

test("new users in 7 days; '+' when the whole newest page is recent and there are more", () => {
  assert.equal(countNewUsers({ items: [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(6) }, { createdAt: daysAgo(9) }], total: 3 }, NOW), "2");
  assert.equal(countNewUsers({ items: [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(2) }], total: 40 }, NOW), "2+");
});
