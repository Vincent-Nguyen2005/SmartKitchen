import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory tables. $transaction runs callbacks one at a time (like the per-day pg advisory lock: a second caller
 * waits until the first commits), and createMany honours the unique (day, productId).
 */
const db = vi.hoisted(() => ({
  products: [] as Array<Record<string, any>>,
  deals: [] as Array<Record<string, any>>,
  days: [] as Array<Record<string, any>>,
  settings: null as Record<string, any> | null,
  locks: [] as string[],
}));
const prismaMock = vi.hoisted(() => {
  const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
  const inRange = (value: Date, where: { gte?: Date; lt?: Date } | Date) =>
    where instanceof Date ? sameDay(value, where) : (!where.gte || value >= where.gte) && (!where.lt || value < where.lt);
  let queue: Promise<unknown> = Promise.resolve();
  const client: Record<string, any> = {
    dailyDealSettings: { findUnique: vi.fn(async () => db.settings) },
    masterIngredient: { findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => db.products.filter((product) => !where?.id || where.id.in.includes(product.id))) },
    dailyDealDay: {
      findUnique: vi.fn(async ({ where }: { where: { day: Date } }) => db.days.find((row) => sameDay(row.day, where.day)) ?? null),
      create: vi.fn(async ({ data }: { data: { day: Date } }) => { if (db.days.some((row) => sameDay(row.day, data.day))) throw Object.assign(new Error("unique"), { code: "P2002" }); db.days.push({ rerolls: 0, ...data }); return data; }),
      update: vi.fn(async ({ where, data }: { where: { day: Date }; data: Record<string, unknown> }) => Object.assign(db.days.find((row) => sameDay(row.day, where.day))!, data)),
    },
    dailyDeal: {
      findMany: vi.fn(async ({ where }: { where: { day: Date | { gte?: Date; lt?: Date } } }) => db.deals.filter((row) => inRange(row.day, where.day))),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, any>> }) => {
        let count = 0;
        for (const row of data) if (!db.deals.some((deal) => sameDay(deal.day, row.day) && deal.productId === row.productId)) { db.deals.push({ ...row, createdAt: new Date() }); count += 1; }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { day: Date; productId?: string } }) => { const before = db.deals.length; db.deals = db.deals.filter((row) => !(sameDay(row.day, where.day) && (!where.productId || row.productId === where.productId))); return { count: before - db.deals.length }; }),
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => { db.deals.push({ ...data, createdAt: new Date() }); return data; }),
    },
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => { db.locks.push(String(values[0])); return 1; }),
  };
  client.$transaction = vi.fn((run: (tx: unknown) => Promise<unknown>) => {
    const next = queue.then(() => run(client));
    queue = next.catch(() => undefined);
    return next;
  });
  return client;
});
vi.mock("./prisma", () => ({ prisma: prismaMock }));

import { clearDealCache, ensureDay, swapDeal, todaysDealPercents } from "./daily-deal-store";
import { vnToday } from "./promotion-sync";

const product = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: `SP ${id}`, englishName: null, isActive: true, price: 20_000, discountPercent: null, promoStartDate: null, promoEndDate: null, ...overrides });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  db.products = Array.from({ length: 30 }, (_, index) => product(`p${String(index).padStart(2, "0")}`));
  db.deals = []; db.days = []; db.settings = null; db.locks = [];
  clearDealCache();
  process.env.INTERNAL_API_KEY = "k".repeat(40);
  process.env.MENU_SERVICE_URL = "http://menu-service:4007";
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [{ name: "sp p03", households: 4 }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("daily deal store", () => {
  it("concurrency: simultaneous first requests make exactly one selection for the day", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureDay("2026-12-10")));
    expect(db.days).toHaveLength(1);
    expect(db.deals).toHaveLength(10);
    expect(results.every((rows) => rows.length === 10)).toBe(true);
    expect(prismaMock.dailyDeal.createMany).toHaveBeenCalledTimes(1);
    expect(db.locks.every((key) => key === "daily-deals:2026-12-10")).toBe(true);
    // Later calls only read.
    await ensureDay("2026-12-10");
    expect(prismaMock.dailyDeal.createMany).toHaveBeenCalledTimes(1);
  });

  it("uses anonymous menu counts (popular product first) and calls no other service: no Thông báo sync", async () => {
    const rows = await ensureDay("2026-12-10");
    expect(rows.find((row) => row.source === "MENU")?.productId).toBe("p03");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://menu-service:4007/internal/week-product-usage");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("notification"))).toBe(false);
  });

  it("menu-service down: still a full random selection", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const rows = await ensureDay("2026-12-10");
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.source === "RANDOM")).toBe(true);
  });

  it("the 3 previous days are not repeated; the 4th day back may be", async () => {
    await ensureDay("2026-12-07");
    await ensureDay("2026-12-08");
    await ensureDay("2026-12-09");
    const recent = new Set(db.deals.map((row) => row.productId));
    const today = await ensureDay("2026-12-10");
    expect(today.some((row) => recent.has(row.productId))).toBe(false);
  });

  it("reroll replaces today's rows; swap replaces one row with an eligible product", async () => {
    const first = (await ensureDay("2026-12-10")).map((row) => row.productId);
    const rerolled = (await ensureDay("2026-12-10", { reroll: true })).map((row) => row.productId);
    expect(rerolled).toHaveLength(10);
    expect(rerolled).not.toEqual(first);
    const swapped = await swapDeal("2026-12-10", rerolled[0]);
    const after = db.deals.filter((row) => row.day.getTime() === new Date("2026-12-10T00:00:00Z").getTime()).map((row) => row.productId);
    expect(after).toHaveLength(10);
    expect(after).not.toContain(rerolled[0]);
    expect(after).toContain(swapped?.added.productId);
    expect(await swapDeal("2026-12-10", "not-today")).toBeNull();
  });

  it("applied on read: off, excluded or admin-discounted products get no deal (admin discount wins)", async () => {
    const day = vnToday();
    const rows = await ensureDay(day);
    const [excluded, manual] = [rows[0].productId, rows[1].productId];
    db.products.find((entry) => entry.id === manual)!.discountPercent = 20;
    db.settings = { enabled: true, dealsPerDay: 10, minPercent: 5, maxPercent: 20, excludedProductIds: [excluded], updatedAt: new Date() };
    const percents = await todaysDealPercents();
    expect(percents.size).toBe(8);
    expect(percents.has(excluded) || percents.has(manual)).toBe(false);
    expect([...percents.values()].every((value) => value >= 5 && value <= 20 && value % 5 === 0)).toBe(true);
    db.settings = { ...db.settings, enabled: false };
    clearDealCache();
    expect((await todaysDealPercents()).size).toBe(0);
  });
});
