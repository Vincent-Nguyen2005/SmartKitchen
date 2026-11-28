import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  foodItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  inventoryLog: { create: vi.fn() },
  cookApplication: { create: vi.fn() },
  purchaseApplication: { create: vi.fn(), findUnique: vi.fn() },
  category: { upsert: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  foodItem: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  purchaseApplication: { findUnique: vi.fn() },
}));
vi.mock("./prisma", () => ({ prisma: prismaMock }));
vi.mock("../services/photo-storage.service", () => ({ PhotoStorage: { removeByUrl: vi.fn() }, managedPhotoFileName: () => null }));

import {
  daysLeft, expiryStage, isExpiredForUse, khoExpiredGraceDays, listedInKhoFilter, mergeableInKhoFilter, parseGraceDays, usableInKhoFilter, vietnamToday,
} from "./kho-expiry";
import { ItemsService } from "../services/items.service";
import { CookService } from "../services/cook.service";
import { PurchasesService } from "../services/purchases.service";
import { AlertsService } from "../services/alerts.service";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
/** hh:mm on a Vietnam calendar day, as an instant. */
const vn = (date: string, time: string) => new Date(new Date(`${date}T${time}:00.000Z`).getTime() - 7 * 3_600_000);

// SQL three-valued logic: a comparison with NULL is unknown (null); AND propagates it; NOT of unknown is unknown, and
// only rows whose WHERE is TRUE are returned.
type Tri = boolean | null;
const and = (...values: Tri[]): Tri => (values.includes(false) ? false : values.includes(null) ? null : true);
const cell = (value: unknown, condition: { not?: unknown; lt?: Date }): Tri => {
  const parts: Tri[] = [];
  if ("not" in condition) parts.push(condition.not === null ? value !== null : value === null ? null : value !== condition.not);
  if ("lt" in condition) parts.push(value === null ? null : (value as Date) < (condition.lt as Date));
  return and(...parts);
};
type Row = { origin: "PURCHASE" | "MANUAL"; status: string; expiryDate: Date | null };
const sqlKeeps = (row: Row, filter: { NOT: Record<string, { not?: unknown; lt?: Date }> }): boolean =>
  and(...Object.entries(filter.NOT).map(([field, condition]) => cell((row as Record<string, unknown>)[field] ?? null, condition))) === false;
const origins = ["PURCHASE", "MANUAL"] as const;

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.KHO_EXPIRED_GRACE_DAYS;
  prismaMock.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.KHO_EXPIRED_GRACE_DAYS;
});

describe("KHO_EXPIRED_GRACE_DAYS setting", () => {
  it("whole days 0–7; missing or empty = 0 without a log line", () => {
    const log = vi.fn();
    expect([undefined, "", "0", "1", "3", " 7 "].map((raw) => parseGraceDays(raw, log))).toEqual([0, 0, 0, 1, 3, 7]);
    expect(log).not.toHaveBeenCalled();
  });

  it("invalid values fall back to 0 with one log line each, naming only the setting", () => {
    const log = vi.fn();
    expect(["8", "-1", "2.5", "abc", "1e1", "3 days"].map((raw) => parseGraceDays(raw, log))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(log).toHaveBeenCalledTimes(6);
    for (const [message] of log.mock.calls) {
      expect(message).toContain("KHO_EXPIRED_GRACE_DAYS");
      expect(message).not.toMatch(/abc|2\.5|3 days/);
    }
  });

  it("the service reads it from the environment (default 0)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(khoExpiredGraceDays({})).toBe(0);
    expect(khoExpiredGraceDays({ KHO_EXPIRED_GRACE_DAYS: "3" })).toBe(3);
    expect(khoExpiredGraceDays({ KHO_EXPIRED_GRACE_DAYS: "9" })).toBe(0);
    expect(khoExpiredGraceDays({ KHO_EXPIRED_GRACE_DAYS: "9" })).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1); // parsed once per value
    warn.mockRestore();
  });
});

describe("Vietnam days", () => {
  it("00:00–07:00 in Vietnam is already the next day", () => {
    expect(vietnamToday(vn("2026-12-02", "00:30"))).toEqual(day("2026-12-02"));
    expect(vietnamToday(vn("2026-12-01", "23:59"))).toEqual(day("2026-12-01"));
    expect(daysLeft(day("2026-12-01"), vn("2026-12-02", "00:30"))).toBe(-1);
    expect(daysLeft(null)).toBeNull();
  });
});

describe("default grace 0: visible on the expiry day, hidden from the next Vietnam midnight", () => {
  const expiry = day("2026-12-01");

  it("both origins, the same rule", () => {
    for (const origin of origins) {
      const row = { origin, status: "FRESH", expiryDate: expiry };
      // 23:59 on the expiry day: "Hết hạn hôm nay", listed and still usable.
      const evening = vn("2026-12-01", "23:59");
      expect(expiryStage(expiry, 0, evening)).toBe("today");
      expect(sqlKeeps(row, listedInKhoFilter(0, evening))).toBe(true);
      expect(sqlKeeps(row, usableInKhoFilter(evening))).toBe(true);
      // 00:00 the next day: hidden from Kho and the alerts, never used.
      const midnight = vn("2026-12-02", "00:00");
      expect(expiryStage(expiry, 0, midnight)).toBe("hidden");
      expect(sqlKeeps(row, listedInKhoFilter(0, midnight))).toBe(false);
      expect(sqlKeeps(row, usableInKhoFilter(midnight))).toBe(false);
      expect(sqlKeeps(row, mergeableInKhoFilter(midnight))).toBe(false);
    }
  });
});

describe("grace 3: listed (dimmed) for 3 days after expiry, hidden on day 4, never used meanwhile", () => {
  const expiry = day("2026-12-01");

  it("both origins, the same rule", () => {
    for (const origin of origins) {
      const row = { origin, status: "FRESH", expiryDate: expiry };
      for (const [date, daysAgo] of [["2026-12-02", 1], ["2026-12-03", 2], ["2026-12-04", 3]] as const) {
        const now = vn(date, "09:00");
        expect(expiryStage(expiry, 3, now)).toBe("grace");
        expect(daysLeft(expiry, now)).toBe(-daysAgo);
        expect(sqlKeeps(row, listedInKhoFilter(3, now))).toBe(true);
        // Not for cooking, the duplicate prompt, merges (and menu-service's weekly missing: expiry before today).
        expect(sqlKeeps(row, usableInKhoFilter(now))).toBe(false);
        expect(sqlKeeps(row, mergeableInKhoFilter(now))).toBe(false);
        expect(isExpiredForUse(row, now)).toBe(true);
      }
      const dayFour = vn("2026-12-05", "00:00");
      expect(expiryStage(expiry, 3, dayFour)).toBe("hidden");
      expect(sqlKeeps(row, listedInKhoFilter(3, dayFour))).toBe(false);
    }
  });

  it("a used-up row with an old expiry may still restart as a fresh batch (merges), a live expired one may not", () => {
    const now = vn("2026-12-03", "09:00");
    expect(sqlKeeps({ origin: "MANUAL", status: "CONSUMED", expiryDate: day("2026-01-01") }, mergeableInKhoFilter(now))).toBe(true);
    expect(sqlKeeps({ origin: "MANUAL", status: "NEAR_EXPIRY", expiryDate: day("2026-12-02") }, mergeableInKhoFilter(now))).toBe(false);
    expect(isExpiredForUse({ status: "CONSUMED", expiryDate: day("2026-01-01") }, now)).toBe(false);
  });
});

describe("rows without an expiry date (NULL) are always listed and usable (SQL NULL pitfall)", () => {
  it("kept by every filter, both origins, any grace", () => {
    const now = vn("2026-12-03", "09:00");
    for (const origin of origins) {
      const row = { origin, status: "FRESH", expiryDate: null };
      for (const grace of [0, 3, 7]) expect(sqlKeeps(row, listedInKhoFilter(grace, now))).toBe(true);
      expect(sqlKeeps(row, usableInKhoFilter(now))).toBe(true);
      expect(sqlKeeps(row, mergeableInKhoFilter(now))).toBe(true);
      expect(expiryStage(null, 0, now)).toBe("no_expiry");
    }
  });

  it("without IS NOT NULL the condition would drop them: the bug the filters avoid", () => {
    const now = vn("2026-12-03", "09:00");
    const withoutNotNull = { NOT: { expiryDate: { lt: listedInKhoFilter(0, now).NOT.expiryDate.lt } } };
    expect(sqlKeeps({ origin: "MANUAL", status: "FRESH", expiryDate: null }, withoutNotNull)).toBe(false);
    expect(listedInKhoFilter(0, now).NOT.expiryDate.not).toBeNull();
    expect(usableInKhoFilter(now).NOT.expiryDate.not).toBeNull();
    expect(mergeableInKhoFilter(now).NOT.expiryDate.not).toBeNull();
  });
});

describe("where the rule applies", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(vn("2026-12-03", "09:00"));
  });

  it("Kho list: hides rows past the grace days (no origin condition) and returns the grace value for the app", async () => {
    process.env.KHO_EXPIRED_GRACE_DAYS = "3";
    prismaMock.foodItem.findMany.mockResolvedValue([]);
    prismaMock.foodItem.count.mockResolvedValue(0);
    const result = await ItemsService.list({ familyId, page: 1, limit: 100 } as never);
    expect(result.expiredGraceDays).toBe(3);
    expect(prismaMock.foodItem.findMany.mock.calls[0][0].where.NOT).toEqual({ expiryDate: { not: null, lt: day("2026-11-30") } });
    delete process.env.KHO_EXPIRED_GRACE_DAYS;
    await ItemsService.list({ familyId, page: 1, limit: 100 } as never);
    expect(prismaMock.foodItem.findMany.mock.calls[1][0].where.NOT).toEqual({ expiryDate: { not: null, lt: day("2026-12-03") } });
  });

  it("cooking never takes an expired row, even one in its grace days whose stored status still says FRESH", async () => {
    process.env.KHO_EXPIRED_GRACE_DAYS = "3";
    tx.cookApplication.create.mockResolvedValue({});
    tx.inventoryLog.create.mockResolvedValue({});
    tx.foodItem.updateMany.mockResolvedValue({ count: 1 });
    const base = { name: "Thịt heo", productId: null, unit: "KILOGRAM", status: "FRESH", createdAt: day("2026-11-01") };
    tx.foodItem.findMany.mockResolvedValue([
      { ...base, id: "grace", quantity: 1, expiryDate: day("2026-12-02") },
      { ...base, id: "today", quantity: 0.2, expiryDate: day("2026-12-03") },
      { ...base, id: "none", quantity: 1, expiryDate: null },
    ]);
    const result = await CookService.cook({ familyId, cookId: "44444444-4444-4444-8444-444444444444", lines: [{ name: "Thịt heo", quantity: 500, unit: "GRAM" }] }, [], userId);
    expect(result.lines[0]).toMatchObject({ used: 500, missing: 0 });
    expect(tx.foodItem.updateMany.mock.calls.map((call) => call[0].where.id)).toEqual(["today", "none"]);
    expect(tx.foodItem.findMany.mock.calls[0][0].where.NOT).toEqual({ expiryDate: { not: null, lt: day("2026-12-03") } });
  });

  it("purchase merges only look at rows that are not past their expiry day", async () => {
    prismaMock.purchaseApplication.findUnique.mockResolvedValue(null);
    tx.foodItem.findMany.mockResolvedValue([]);
    tx.foodItem.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", ...data }));
    tx.inventoryLog.create.mockResolvedValue({});
    tx.purchaseApplication.create.mockResolvedValue({});
    await PurchasesService.apply({ externalPurchaseId: "p-1", familyId, name: "Thịt heo", quantity: 1, unit: "KILOGRAM", createdByUserId: userId } as never);
    expect(tx.foodItem.findMany.mock.calls[0][0].where.NOT).toEqual({ status: { not: "CONSUMED" }, expiryDate: { not: null, lt: day("2026-12-03") } });
  });

  it("the duplicate prompt leaves out expired rows the same way", async () => {
    prismaMock.foodItem.findMany.mockResolvedValue([]);
    await ItemsService.findDuplicate(familyId, { name: "Thịt heo", productId: null, unit: "KILOGRAM" });
    expect(prismaMock.foodItem.findMany.mock.calls[0][0].where.NOT).toEqual({ status: { not: "CONSUMED" }, expiryDate: { not: null, lt: day("2026-12-03") } });
  });
});

describe("expiry alerts per stage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(vn("2026-12-03", "09:00"));
  });
  const rows = [
    { id: "past", expiryDate: day("2026-11-29") },
    { id: "grace", expiryDate: day("2026-12-01") },
    { id: "today", expiryDate: day("2026-12-03") },
    { id: "soon", expiryDate: day("2026-12-05") },
  ];

  it("grace 0: 'hết hạn sau N ngày' and 'hết hạn hôm nay' only; nothing once expired", async () => {
    prismaMock.foodItem.findMany.mockResolvedValue(rows);
    const result = await AlertsService.getExpiringItems({ familyId, days: 3 });
    expect(result.map((item) => [item.id, item.daysLeft, item.stage])).toEqual([["today", 0, "today"], ["soon", 2, "fresh"]]);
    expect(prismaMock.foodItem.findMany.mock.calls[0][0].where.NOT).toEqual({ expiryDate: { not: null, lt: day("2026-12-03") } });
  });

  it("grace 3: 'đã hết hạn N ngày' only during the grace days; hidden rows never alert", async () => {
    process.env.KHO_EXPIRED_GRACE_DAYS = "3";
    prismaMock.foodItem.findMany.mockResolvedValue(rows);
    const result = await AlertsService.getExpiringItems({ familyId, days: 3 });
    // 29/11 is 4 days ago (hidden) even if the query returned it; 01/12 is 2 days ago (grace).
    expect(result.map((item) => [item.id, item.daysLeft, item.stage])).toEqual([["grace", -2, "grace"], ["today", 0, "today"], ["soon", 2, "fresh"]]);
  });
});
