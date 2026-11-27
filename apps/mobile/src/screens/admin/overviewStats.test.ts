/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { countNewUsers, reportsDetail, servicesDetail, servicesSummary } from "./overviewStats";

const NOW = Date.parse("2026-11-27T05:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

test("new users in 7 days; '+' when the whole newest page is recent and there are more", () => {
  assert.equal(countNewUsers({ items: [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(6) }, { createdAt: daysAgo(9) }], total: 3 }, NOW), "2");
  assert.equal(countNewUsers({ items: [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(2) }], total: 40 }, NOW), "2+");
});

test("services: counts per status and the ones that need attention (down, slow, or slow p95)", () => {
  const summary = servicesSummary([
    { serviceName: "auth-service", status: "UP" },
    { serviceName: "menu-service", status: "UP" },
    { serviceName: "inventory-service", status: "DEGRADED" },
    { serviceName: "payment-service", status: "DOWN" },
    { serviceName: "nutrition-service", status: null },
  ], new Map([["menu-service", 900], ["auth-service", 40]]));
  assert.deepEqual({ ...summary, problems: summary.problems.sort() }, { up: 2, slow: 1, down: 1, unmeasured: 1, total: 5, problems: ["inventory", "menu", "nutrition", "payment"] }); // never measured counts too (healthTriage.ts)
  assert.equal(servicesDetail(summary), "2/5 dịch vụ hoạt động · Chậm 1 · Ngừng 1 · Chưa đo 1");
});

test("reports detail", () => {
  assert.equal(reportsDetail({ byStatus: { IN_REVIEW: 2 }, resolvedInWindow: 3 }), "2 đang xem xét · 3 đã xử lý (24 giờ)");
  assert.equal(reportsDetail({ byStatus: {} }), "0 đang xem xét · 0 đã xử lý (24 giờ)");
});
