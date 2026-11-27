import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ purchase: { findMany: vi.fn() } }));
const axiosMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("axios", () => ({ default: axiosMock }));

import { periodRange, reconcile, RevenueService, type DeliveredOrder } from "./revenue.service";

// 01:00 on Tuesday 01/12/2026 in Vietnam = 18:00 UTC on 30/11.
const NOW = new Date("2026-11-30T18:00:00.000Z");
beforeEach(() => { vi.clearAllMocks(); });

describe("periods (Vietnam days)", () => {
  it("today: the Vietnam day even when UTC is still the day before; offsets step back", () => {
    const today = periodRange("today", 0, NOW);
    expect([today.firstDay, today.lastDay]).toEqual(["2026-12-01", "2026-12-01"]);
    expect(today.from.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(periodRange("today", -1, NOW).firstDay).toBe("2026-11-30");
  });

  it("7 days: today and the 6 before; one step back is the 7 days before that", () => {
    const week = periodRange("7d", 0, NOW);
    expect([week.firstDay, week.lastDay]).toEqual(["2026-11-25", "2026-12-01"]);
    expect([periodRange("7d", -1, NOW).firstDay, periodRange("7d", -1, NOW).lastDay]).toEqual(["2026-11-18", "2026-11-24"]);
  });

  it("month: the calendar month in Vietnam; offset -1 is the previous month (any length)", () => {
    const month = periodRange("month", 0, NOW);
    expect([month.firstDay, month.lastDay]).toEqual(["2026-12-01", "2026-12-31"]);
    expect(month.from.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect([periodRange("month", -1, NOW).firstDay, periodRange("month", -1, NOW).lastDay]).toEqual(["2026-11-01", "2026-11-30"]);
    expect(periodRange("month", -11, NOW).firstDay).toBe("2026-01-01");
  });
});

describe("shipper cash reconciliation", () => {
  const orders: DeliveredOrder[] = [
    { id: "a", codAmount: 280_000, deliveredAt: new Date("2026-11-30T03:00:00Z"), shipperId: "s1", receiverName: "Lan" },
    { id: "b", codAmount: 135_000, deliveredAt: new Date("2026-11-30T20:00:00Z"), shipperId: "s2", receiverName: "Minh" },
    { id: "c", codAmount: 90_000, deliveredAt: new Date("2026-11-30T09:00:00Z"), shipperId: "s1", receiverName: "Hoa" },
    { id: "d", codAmount: 45_000, deliveredAt: new Date("2026-11-25T01:00:00Z"), shipperId: null, receiverName: null },
  ];

  it("total COD and delivered count; per-shipper rows sorted by amount add up to the total", () => {
    const result = reconcile(orders);
    expect(result).toMatchObject({ total: 550_000, orders: 4 });
    expect(result.shippers.map((row) => [row.shipperId, row.orders, row.amount])).toEqual([["s1", 2, 370_000], ["s2", 1, 135_000], [null, 1, 45_000]]);
    expect(result.shippers.reduce((sum, row) => sum + row.amount, 0)).toBe(result.total);
  });

  it("each shipper's delivered orders, newest first (time, receiver, total)", () => {
    const s1 = reconcile(orders).shippers[0];
    expect(s1.deliveries).toEqual([
      { id: "c", deliveredAt: "2026-11-30T09:00:00.000Z", receiverName: "Hoa", total: 90_000 },
      { id: "a", deliveredAt: "2026-11-30T03:00:00.000Z", receiverName: "Lan", total: 280_000 },
    ]);
  });

  it("no direct purchases: no 'Mua trực tiếp' row; nothing delivered: zero totals", () => {
    expect(reconcile(orders.filter((order) => order.shipperId)).shippers.some((row) => row.shipperId === null)).toBe(false);
    expect(reconcile([])).toEqual({ total: 0, orders: 0, shippers: [] });
  });

  it("report: DELIVERED orders by delivery time in the period; names and avatars only (no ids or phones)", async () => {
    const range = periodRange("7d", 0, NOW);
    prismaMock.purchase.findMany.mockResolvedValue(orders.map((order) => ({ ...order, total: order.codAmount })));
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    axiosMock.post.mockResolvedValue({ data: { items: [{ id: "s1", name: "Anh Tú", phone: "0900000000", avatarUrl: "/api/inventory/avatars/x.jpg" }, { id: "s2", name: "Chị Mai", phone: "0911111111", avatarUrl: null }] } });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const report = await RevenueService.report("7d", 0);
    vi.useRealTimers();
    expect(prismaMock.purchase.findMany.mock.calls[0][0].where).toEqual({ status: "DELIVERED", deliveredAt: { gte: range.from, lt: range.to } });
    expect(report).toMatchObject({ period: { kind: "7d", firstDay: "2026-11-25", lastDay: "2026-12-01" }, total: 550_000, orders: 4 });
    expect(report.shippers.map((row) => [row.name, row.avatarUrl, row.direct, row.orders, row.amount])).toEqual([
      ["Anh Tú", "/api/inventory/avatars/x.jpg", false, 2, 370_000], ["Chị Mai", null, false, 1, 135_000], [null, null, true, 1, 45_000],
    ]);
    expect(Object.keys(report).sort()).toEqual(["orders", "period", "shippers", "total"]);
    expect(JSON.stringify(report)).not.toContain("0900000000");
    expect(JSON.stringify(report)).not.toContain("\"s1\"");
    await expect(RevenueService.report("today", 1)).rejects.toMatchObject({ statusCode: 400 });
  });
});
