import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    purchase: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    shoppingItem: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../lib/prisma", () => ({ prisma: mocks.prisma }));

import type { NextFunction, Request, Response } from "express";
import { changePercent, groupTotals, lineTotalOf, monthSpending, paidUnitPrice, previousMonth, recordPurchase, vnMonth, vnMonthRange } from "./spending.service";
import { ShoppingListController } from "../controllers/shopping-list.controller";
import { errorHandler } from "../middleware/error.middleware";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma));
});

describe("Vietnam months", () => {
  it("a month starts and ends at midnight Vietnam time (17:00 UTC the day before)", () => {
    const { from, to } = vnMonthRange("2026-11");
    expect(from.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(vnMonthRange("2026-12").to.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  it("the current month follows Vietnam time, not UTC", () => {
    expect(vnMonth(new Date("2026-11-30T16:59:59Z"))).toBe("2026-11"); // 23:59:59 on 30/11 in Vietnam
    expect(vnMonth(new Date("2026-11-30T17:00:00Z"))).toBe("2026-12"); // 00:00 on 1/12 in Vietnam
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
  });

  it("rejects a malformed month", () => {
    expect(() => vnMonthRange("2026-13")).toThrow();
    expect(() => vnMonthRange("26-11")).toThrow();
  });
});

describe("amounts", () => {
  it("same rounding as the checkout: discounted unit price, then round(price × quantity)", () => {
    expect(paidUnitPrice(30000, 15)).toBe(25500);
    expect(paidUnitPrice(33333, 10)).toBe(30000); // 29999.7 → 30000
    expect(lineTotalOf(25500, 1.5)).toBe(38250);
    expect(lineTotalOf(12345, 0.3)).toBe(3704); // 3703.5 → 3704
    expect(lineTotalOf(null, 2)).toBeNull();
  });

  it("previous-month comparison in whole percent; none when the previous month is 0", () => {
    expect(changePercent(1_120_000, 1_000_000)).toBe(12);
    expect(changePercent(950_000, 1_000_000)).toBe(-5);
    expect(changePercent(500_000, 0)).toBeNull();
  });

  it("groups: sorted by amount, no group → Khác, top 6 then the rest merged into Khác; percents of the total", () => {
    const lines = [
      { lineTotal: 500, groupName: "Thịt" }, { lineTotal: 300, groupName: "Rau củ" }, { lineTotal: 200, groupName: null },
      { lineTotal: null, groupName: "Gia vị" }, // no price: not counted
    ];
    expect(groupTotals(lines)).toEqual([
      { name: "Thịt", amount: 500, percent: 50 }, { name: "Rau củ", amount: 300, percent: 30 }, { name: "Khác", amount: 200, percent: 20 },
    ]);
    const many = ["A", "B", "C", "D", "E", "F", "G", "H"].map((name, index) => ({ lineTotal: 100 - index, groupName: name }));
    const rows = groupTotals(many);
    expect(rows.map((row) => row.name)).toEqual(["A", "B", "C", "D", "E", "F", "Khác"]);
    expect(rows.at(-1)?.amount).toBe(94 + 93); // G + H
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(many.reduce((sum, line) => sum + line.lineTotal, 0));
  });

  it("checkout promotion: groups count lineTotal − discountShare, so they still add up to the discounted total", () => {
    // Order: subtotal 200 000, "Rau củ" promotion 9 999 split 5 624 / 4 375 (checkout-promotion.ts) → total 190 001.
    const lines = [
      { lineTotal: 120_000, groupName: "Thịt", discountShare: 0 },
      { lineTotal: 45_000, groupName: "Rau củ", discountShare: 5_624 },
      { lineTotal: 35_000, groupName: "Rau củ", discountShare: 4_375 },
    ];
    const groups = groupTotals(lines);
    expect(groups).toEqual([{ name: "Thịt", amount: 120_000, percent: 63 }, { name: "Rau củ", amount: 70_001, percent: 37 }]);
    expect(groups.reduce((sum, group) => sum + group.amount, 0)).toBe(190_001);
  });
});

describe("recordPurchase", () => {
  it("one purchase for the lines that reached Kho: snapshots, buyer, total = sum of rounded line totals", async () => {
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([
      { id: "i1", quantity: 1.5, unitPrice: 30000, discountPercent: 15, productId: "p-meat" },
      { id: "i2", quantity: 2, unitPrice: null, discountPercent: null, productId: "p-egg" }, // no snapshot: catalog price
      { id: "i3", quantity: 1, unitPrice: null, discountPercent: null, productId: null }, // no price at all
    ]);
    mocks.prisma.purchase.create.mockResolvedValue({ id: "pur-1" });
    const catalog = new Map([["p-meat", { group: "Thịt" }], ["p-egg", { group: "Trứng & sữa", unitLabel: "quả", price: 3500, discountPercent: null }]]);
    const now = new Date("2026-11-26T11:05:00Z");
    expect(await recordPurchase(familyId, userId, ["i1", "i2", "i3"], catalog, now)).toEqual({ id: "pur-1", total: 38250 + 7000, itemCount: 3 });
    // Only completed lines (in Kho, not yet in a purchase) of this family are read.
    expect(mocks.prisma.shoppingItem.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["i1", "i2", "i3"] }, purchaseId: null, isPurchased: true, inventoryAppliedAt: { not: null }, shoppingList: { familyId } });
    // A direct purchase is an order that is already delivered.
    expect(mocks.prisma.purchase.create).toHaveBeenCalledWith({ data: { familyId, buyerUserId: userId, purchasedAt: now, total: 45250, subtotal: 45250, codAmount: 45250, itemCount: 3, status: "DELIVERED", deliveredAt: now } });
    const updates = mocks.prisma.shoppingItem.update.mock.calls.map((call) => call[0].data);
    expect(updates[0]).toMatchObject({ purchaseId: "pur-1", paidUnitPrice: 25500, lineTotal: 38250, groupName: "Thịt" });
    expect(updates[1]).toMatchObject({ unitPrice: 3500, paidUnitPrice: 3500, lineTotal: 7000, groupName: "Trứng & sữa", unitLabel: "quả" });
    expect(updates[2]).toMatchObject({ paidUnitPrice: null, lineTotal: null, groupName: null });
  });

  it("a purchase always has a buyer: recording without one is refused and nothing is written", async () => {
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([{ id: "i1", quantity: 1, unitPrice: 1000, discountPercent: null, productId: null }]);
    for (const buyer of ["", "  ", null, undefined]) {
      await expect(recordPurchase(familyId, buyer as unknown as string, ["i1"], new Map())).rejects.toMatchObject({ statusCode: 400, code: "BUYER_REQUIRED" });
    }
    expect(mocks.prisma.shoppingItem.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.purchase.create).not.toHaveBeenCalled();
  });

  it("nothing completed (failed lines stay in the cart, or already recorded): no purchase", async () => {
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([]);
    expect(await recordPurchase(familyId, userId, ["i9"], new Map())).toBeNull();
    expect(mocks.prisma.purchase.create).not.toHaveBeenCalled();
    expect(await recordPurchase(familyId, userId, [], new Map())).toBeNull();
  });
});

describe("monthSpending", () => {
  it("totals, comparison, groups and the purchase list for one Vietnam month", async () => {
    mocks.prisma.purchase.aggregate.mockResolvedValueOnce({ _sum: { total: 1_120_000 } }).mockResolvedValueOnce({ _sum: { total: 1_000_000 } });
    mocks.prisma.purchase.count.mockResolvedValue(2);
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([
      { lineTotal: 800_000, groupName: "Thịt", productId: "p1" },
      { lineTotal: 320_000, groupName: null, productId: "p-veg" }, // bought before snapshots: catalog group now
    ]);
    mocks.prisma.purchase.findMany.mockResolvedValue([{
      id: "pur-1", purchasedAt: new Date("2026-11-25T08:00:00Z"), deliveredAt: new Date("2026-11-26T11:05:00Z"), buyerUserId: userId, itemCount: 1, total: 38250,
      items: [{ id: "i1", name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", unitLabel: null, unitPrice: 30000, discountPercent: 15, paidUnitPrice: 25500, lineTotal: 38250, groupName: "Thịt", productId: "p1" }],
    }]);
    const catalog = vi.fn(async () => new Map([["p-veg", { group: "Rau củ" }]]));
    const result = await monthSpending(familyId, "2026-11", { catalog });
    expect(result).toMatchObject({ month: "2026-11", previousMonth: "2026-10", total: 1_120_000, previousTotal: 1_000_000, changePercent: 12, purchaseCount: 2 });
    expect(result.groups).toEqual([{ name: "Thịt", amount: 800_000, percent: 71 }, { name: "Rau củ", amount: 320_000, percent: 29 }]);
    expect(result.purchases.items[0]).toEqual({
      id: "pur-1", purchasedAt: "2026-11-26T11:05:00.000Z", buyerUserId: userId, itemCount: 1, total: 38250, subtotal: 38250, promotionName: null, discountAmount: 0,
      lines: [{ id: "i1", name: "Thịt heo", quantity: 1.5, unit: "KILOGRAM", unitLabel: null, unitPrice: 25500, originalUnitPrice: 30000, discountPercent: 15, lineTotal: 38250, group: "Thịt" }],
    });
    // Delivered orders only, by delivery day (Vietnam month), the newest delivery first; purchasedAt shows the delivery time.
    const where = mocks.prisma.purchase.findMany.mock.calls[0][0];
    expect(where.where).toEqual({ familyId, status: "DELIVERED", deliveredAt: { gte: new Date("2026-10-31T17:00:00Z"), lt: new Date("2026-11-30T17:00:00Z") } });
    expect(where.orderBy).toEqual({ deliveredAt: "desc" });
    expect(mocks.prisma.purchase.aggregate.mock.calls[1][0].where).toEqual({ familyId, status: "DELIVERED", deliveredAt: { gte: new Date("2026-09-30T17:00:00Z"), lt: new Date("2026-10-31T17:00:00Z") } });
    expect(catalog).toHaveBeenCalledWith(["p-veg"]);
  });

  it("an empty month: zero totals, no comparison, no groups", async () => {
    mocks.prisma.purchase.aggregate.mockResolvedValue({ _sum: { total: null } });
    mocks.prisma.purchase.count.mockResolvedValue(0);
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([]);
    mocks.prisma.purchase.findMany.mockResolvedValue([]);
    expect(await monthSpending(familyId, "2026-09")).toMatchObject({ total: 0, previousTotal: 0, changePercent: null, groups: [], purchases: { items: [], total: 0 } });
  });
});

describe("GET /spending authorization", () => {
  const run = async (familyOfCaller: string | null) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(familyOfCaller
      ? { ok: true, status: 200, json: async () => ({ data: { family: { id: familyOfCaller } } }) }
      : { ok: false, status: 404, json: async () => ({}) }));
    const req = { query: { familyId, month: "2026-11" }, authUser: { userId, token: "t" } } as unknown as Request;
    const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    let failure: unknown;
    await ShoppingListController.spending(req, res as unknown as Response, ((error: unknown) => { failure = error; }) as NextFunction);
    if (failure) errorHandler(failure, req, res as unknown as Response, (() => undefined) as NextFunction);
    vi.unstubAllGlobals();
    return res;
  };

  it("another family's or no family: 403, nothing read", async () => {
    expect((await run("22222222-2222-4222-8222-222222222222")).statusCode).toBe(403);
    expect((await run(null)).statusCode).toBe(403);
    expect(mocks.prisma.purchase.findMany).not.toHaveBeenCalled();
  });

  it("a member gets the month", async () => {
    mocks.prisma.purchase.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    mocks.prisma.purchase.count.mockResolvedValue(0);
    mocks.prisma.shoppingItem.findMany.mockResolvedValue([]);
    mocks.prisma.purchase.findMany.mockResolvedValue([]);
    const res = await run(familyId);
    expect(res.statusCode).toBe(200);
    expect((res.body as { data: { month: string } }).data.month).toBe("2026-11");
  });
});
