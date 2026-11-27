import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ purchase: { findMany: vi.fn() } }));
const axiosMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("axios", () => ({ default: axiosMock }));

import { periodRange, RevenueService, summarize, type RevenueOrder } from "./revenue.service";

// 01:00 on Tuesday 01/12/2026 in Vietnam = 18:00 UTC on 30/11.
const NOW = new Date("2026-11-30T18:00:00.000Z");
const line = (overrides: Partial<RevenueOrder["items"][number]> = {}): RevenueOrder["items"][number] => ({
  productId: "beef", name: "Thịt bò", quantity: 1, unit: "KILOGRAM", unitLabel: null, unitPrice: 300_000, lineTotal: 270_000, discountShare: 0, groupName: "Thịt", ...overrides,
});

describe("periods (Vietnam days)", () => {
  it("today: the Vietnam day even when UTC is still the day before; offsets step back", () => {
    const today = periodRange("today", 0, NOW);
    expect([today.firstDay, today.lastDay]).toEqual(["2026-12-01", "2026-12-01"]);
    expect(today.from.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(today.to.toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(periodRange("today", -1, NOW).firstDay).toBe("2026-11-30");
  });

  it("7 days: today and the 6 before; the previous period is the 7 days before that", () => {
    const week = periodRange("7d", 0, NOW);
    expect([week.firstDay, week.lastDay, week.days.length]).toEqual(["2026-11-25", "2026-12-01", 7]);
    expect([periodRange("7d", -1, NOW).firstDay, periodRange("7d", -1, NOW).lastDay]).toEqual(["2026-11-18", "2026-11-24"]);
  });

  it("month: the calendar month in Vietnam; offset -1 is the previous month (any length)", () => {
    const month = periodRange("month", 0, NOW);
    expect([month.firstDay, month.lastDay, month.days.length]).toEqual(["2026-12-01", "2026-12-31", 31]);
    expect(month.from.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    const november = periodRange("month", -1, NOW);
    expect([november.firstDay, november.lastDay, november.days.length]).toEqual(["2026-11-01", "2026-11-30", 30]);
    expect(periodRange("month", -11, NOW).firstDay).toBe("2026-01-01");
  });
});

describe("revenue math", () => {
  const range = periodRange("7d", 0, NOW);
  const orders: RevenueOrder[] = [
    // 270 000 (beef, 10% item discount) + 2 × 15 000 (carrots) = 300 000; promotion 20 000 split 18 000 / 2 000.
    { total: 280_000, discountAmount: 20_000, deliveredAt: new Date("2026-11-30T03:00:00Z"), shipperId: "s1", items: [line({ discountShare: 18_000 }), line({ productId: "carrot", name: "Cà rốt", quantity: 2, unitPrice: 15_000, lineTotal: 30_000, discountShare: 2_000, groupName: "Rau củ" })] },
    { total: 135_000, discountAmount: 0, deliveredAt: new Date("2026-11-30T20:00:00Z"), shipperId: "s2", items: [line({ quantity: 0.5, lineTotal: 135_000 })] },
    // A direct purchase (no shipper), no price snapshot line.
    { total: 45_000, discountAmount: 0, deliveredAt: new Date("2026-11-25T01:00:00Z"), shipperId: null, items: [line({ productId: "carrot", name: "Cà rốt", quantity: 3, unitPrice: 15_000, lineTotal: 45_000, groupName: "Rau củ" }), line({ productId: null, name: "Khác", unitPrice: null, lineTotal: null })] },
  ];
  const summary = summarize(orders, range);

  it("totals, average and the two kinds of discount", () => {
    expect(summary).toMatchObject({ total: 460_000, orders: 3, average: 153_333 });
    // Item discounts: beef 300k→270k (30 000) and 150k→135k (15 000); carrots none. Promotions: 20 000.
    expect(summary.discounts).toEqual({ items: 45_000, promotions: 20_000 });
  });

  it("per day by Vietnam delivery day (20:00 UTC on 30/11 is 01/12 in Vietnam)", () => {
    expect(summary.days.find((day) => day.day === "2026-11-30")?.total).toBe(280_000);
    expect(summary.days.find((day) => day.day === "2026-12-01")?.total).toBe(135_000);
    expect(summary.days.find((day) => day.day === "2026-11-25")?.total).toBe(45_000);
    expect(summary.days.reduce((sum, day) => sum + day.total, 0)).toBe(summary.total);
  });

  it("groups, shippers and top products add up; promotion shares are taken off the lines", () => {
    expect(summary.groups.reduce((sum, group) => sum + group.amount, 0)).toBe(summary.total);
    expect(summary.shippers.reduce((sum, shipper) => sum + shipper.amount, 0)).toBe(summary.total);
    expect(summary.shippers).toEqual([{ shipperId: "s1", orders: 1, amount: 280_000 }, { shipperId: "s2", orders: 1, amount: 135_000 }, { shipperId: null, orders: 1, amount: 45_000 }]);
    expect(summary.topProducts.map((product) => [product.name, product.quantity, product.revenue])).toEqual([["Thịt bò", 1.5, 387_000], ["Cà rốt", 5, 73_000]]);
  });

  it("report: DELIVERED orders only, by delivery time in the period; comparison with the previous period; shipper names only", async () => {
    prismaMock.purchase.findMany.mockImplementation(async ({ where }: { where: { deliveredAt: { gte: Date } } }) =>
      (where.deliveredAt.gte.getTime() === range.from.getTime() ? orders : [{ ...orders[1], total: 400_000 }]));
    process.env.INTERNAL_API_KEY = "k".repeat(40);
    axiosMock.post.mockResolvedValue({ data: { items: [{ id: "s1", name: "Anh Tú", phone: "0900000000" }, { id: "s2", name: "Chị Mai", phone: "0911111111" }] } });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const report = await RevenueService.report("7d", 0);
    vi.useRealTimers();
    expect(prismaMock.purchase.findMany.mock.calls[0][0].where).toEqual({ status: "DELIVERED", deliveredAt: { gte: range.from, lt: range.to } });
    expect(report).toMatchObject({ total: 460_000, previous: { total: 400_000, orders: 1 }, changePercent: 15 });
    expect(report.shippers).toEqual([{ name: "Anh Tú", direct: false, orders: 1, amount: 280_000 }, { name: "Chị Mai", direct: false, orders: 1, amount: 135_000 }, { name: null, direct: true, orders: 1, amount: 45_000 }]);
    expect(JSON.stringify(report)).not.toContain("0900000000");
    await expect(RevenueService.report("today", 1)).rejects.toMatchObject({ statusCode: 400 });
  });
});

beforeEach(() => { vi.clearAllMocks(); });
