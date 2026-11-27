import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
// Today's automatic daily deals (lib/daily-deal-store.ts): none unless a test sets them.
const dealsMock = vi.hoisted(() => ({ percents: new Map<string, number>() }));
vi.mock("../lib/daily-deal-store", () => ({ todaysDealPercents: async () => dealsMock.percents }));

import adminRouter from "./admin.route";
import { addDays, vnToday } from "../lib/promotion-sync";

const app = express().use(express.json()).use(adminRouter);
const asUser = (test: request.Test) => test.set("x-user-id", "user-1").set("x-user-role", "USER");
const asAdmin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const day = (offset: number) => new Date(`${addDays(vnToday(), offset)}T00:00:00.000Z`);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "i1", name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", shelfLifeDays: 7,
  imageUrl: "https://cdn.example.com/ca-chua.jpg", discountPercent: null, promoEndDate: null, price: 25000, ...overrides,
});

let rows: ReturnType<typeof row>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  rows = [row()];
  dealsMock.percents = new Map();
  // Array form for the catalog query, callback form for admin writes.
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => unknown)(prismaMock)));
  prismaMock.masterIngredient.findMany.mockImplementation(async (args: { distinct?: string[] }) =>
    args.distinct ? [{ category: "Rau củ" }, { category: "Thịt" }] : rows);
  prismaMock.masterIngredient.count.mockImplementation(async () => rows.length);
});

const catalogCall = () => prismaMock.masterIngredient.findMany.mock.calls.map((call) => call[0]).find((args) => !args.distinct);

describe("GET /catalog/ingredients (signed-in users)", () => {
  it("lets a normal user read public fields, groups and paging info", async () => {
    const response = await asUser(request(app).get("/catalog/ingredients"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ id: "i1", name: "Cà chua", group: "Rau củ", unit: "KILOGRAM", shelfLifeDays: 7, imageUrl: "https://cdn.example.com/ca-chua.jpg", discountPercent: null, promoEndDate: null, price: 25000 }],
      page: 1, limit: 20, total: 1, totalPages: 1, groups: ["Rau củ", "Thịt"],
    });
  });

  it("returns the pack weight of pack products (grams per bó / gói) for unit conversion", async () => {
    rows = [row({ name: "Hành lá", defaultUnit: "PACK", price: 5000, packGrams: 100 })];
    const response = await asUser(request(app).get("/catalog/ingredients"));
    expect(response.body.items[0]).toMatchObject({ name: "Hành lá", unit: "PACK", price: 5000, packGrams: 100 });
    expect(catalogCall().select).toMatchObject({ packGrams: true });
  });

  it("validates the pack weight on admin writes (positive whole grams; empty clears it)", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue(row());
    prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data }));
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ packGrams: 0 }))).status).toBe(400);
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ packGrams: 1.5 }))).status).toBe(400);
    const saved = await asAdmin(request(app).put("/ingredients/i1").send({ packGrams: "" }));
    expect(saved.status).toBe(200);
    expect(prismaMock.masterIngredient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ packGrams: null }) }));
  });

  it("returns and validates the weight of one piece (kg / pack products recipes count in pieces)", async () => {
    rows = [row({ name: "Cà chua", defaultUnit: "KILOGRAM", price: 30000, pieceGrams: 100 })];
    const response = await asUser(request(app).get("/catalog/ingredients"));
    expect(catalogCall().select).toMatchObject({ pieceGrams: true });
    expect(response.body.items[0]).toMatchObject({ name: "Cà chua", unit: "KILOGRAM", pieceGrams: 100 });
    prismaMock.masterIngredient.findUnique.mockResolvedValue(row());
    prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data }));
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ pieceGrams: 0 }))).status).toBe(400);
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ pieceGrams: 2.5 }))).status).toBe(400);
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ pieceGrams: 150 }))).status).toBe(200);
    expect(prismaMock.masterIngredient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ pieceGrams: 150 }) }));
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ pieceGrams: "" }))).status).toBe(200);
    expect(prismaMock.masterIngredient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ pieceGrams: null }) }));
  });

  it("filters by product ids (this week's missing products) and returns the piece unit word", async () => {
    rows = [row({ id: "p-1", name: "Bưởi", defaultUnit: "PIECE", price: 60000, packGrams: 1200, unitLabel: "quả" })];
    const response = await asUser(request(app).get("/catalog/ingredients?ids=p-1,%20p-2,,"));
    expect(catalogCall().where).toEqual({ isActive: true, id: { in: ["p-1", "p-2"] } });
    expect(catalogCall().select).toMatchObject({ unitLabel: true, packGrams: true });
    expect(response.body.items[0]).toMatchObject({ unit: "PIECE", packGrams: 1200, unitLabel: "quả" });
  });

  it("accepts only the fixed unit words on admin writes; empty clears it", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue(row());
    prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data }));
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ unitLabel: "con" }))).status).toBe(400);
    expect((await asAdmin(request(app).put("/ingredients/i1").send({ unitLabel: "bìa" }))).status).toBe(200);
    expect(prismaMock.masterIngredient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitLabel: "bìa" }) }));
    await asAdmin(request(app).put("/ingredients/i1").send({ unitLabel: "" }));
    expect(prismaMock.masterIngredient.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitLabel: null }) }));
  });

  it("requires sign-in and keeps the admin list admin-only", async () => {
    expect((await request(app).get("/catalog/ingredients")).status).toBe(401);
    expect((await asUser(request(app).get("/ingredients"))).status).toBe(403);
  });

  it("only queries active rows (inactive products are hidden)", async () => {
    await asUser(request(app).get("/catalog/ingredients"));
    expect(catalogCall().where).toEqual({ isActive: true });
    expect(prismaMock.masterIngredient.findMany).toHaveBeenCalledWith(expect.objectContaining({ distinct: ["category"], where: { isActive: true } }));
  });

  it("returns a discount only while the promotion is valid", async () => {
    rows = [
      row({ id: "expired", discountPercent: 20, promoEndDate: day(-1) }),
      row({ id: "today", discountPercent: 15, promoEndDate: day(0) }),
      row({ id: "rolling", discountPercent: 10, promoEndDate: null }),
    ];
    const { body } = await asUser(request(app).get("/catalog/ingredients"));
    const byId = Object.fromEntries(body.items.map((item: { id: string }) => [item.id, item]));
    expect(byId.expired).toMatchObject({ discountPercent: null, promoEndDate: null });
    expect(byId.today).toMatchObject({ discountPercent: 15, promoEndDate: addDays(vnToday(), 0) });
    expect(byId.rolling).toMatchObject({ discountPercent: 10, promoEndDate: null });
  });

  it("filters by accent-insensitive search, group and onSale", async () => {
    await asUser(request(app).get("/catalog/ingredients").query({ search: "Cà  CHUA", group: "rau củ", onSale: "true" }));
    expect(catalogCall().where).toEqual({
      isActive: true,
      nameNormalized: { contains: "ca  chua" },
      category: { equals: "rau củ", mode: "insensitive" },
      // An admin discount running today, or one of today's daily deals.
      OR: [
        {
          discountPercent: { not: null },
          AND: [
            { OR: [{ promoStartDate: null }, { promoStartDate: { lte: day(0) } }] },
            { OR: [{ promoEndDate: null }, { promoEndDate: { gte: day(0) } }] },
          ],
        },
        { id: { in: [] } },
      ],
    });
  });

  it("daily deals: priced exactly like an admin discount (same fields), on sale, and an admin discount wins", async () => {
    dealsMock.percents = new Map([["deal", 15], ["manual", 10]]);
    rows = [
      row({ id: "deal", price: 40000 }),
      row({ id: "manual", discountPercent: 20, promoEndDate: day(3) }),
      row({ id: "plain" }),
    ];
    const { body } = await asUser(request(app).get("/catalog/ingredients").query({ onSale: "true" }));
    const byId = Object.fromEntries(body.items.map((item: { id: string }) => [item.id, item]));
    // Same shape as an admin discount ending today: the app's pill, struck price and cart snapshot use these fields.
    expect(byId.deal).toMatchObject({ discountPercent: 15, promoEndDate: vnToday(), price: 40000 });
    expect(Object.keys(byId.deal).sort()).toEqual(Object.keys(byId.manual).sort());
    expect(byId.manual).toMatchObject({ discountPercent: 20, promoEndDate: addDays(vnToday(), 3) });
    expect(byId.plain).toMatchObject({ discountPercent: null, promoEndDate: null });
    expect(catalogCall().where.OR[1]).toEqual({ id: { in: ["deal", "manual"] } });
  });

  it("still accepts the older q parameter used by Kho suggestions", async () => {
    await asUser(request(app).get("/catalog/ingredients").query({ q: "Thịt" }));
    expect(catalogCall().where).toEqual({ isActive: true, nameNormalized: { contains: "thit" } });
  });

  it("paginates with a default of 20 and a maximum of 50", async () => {
    rows = Array.from({ length: 3 }, (_, index) => row({ id: `i${index}` }));
    prismaMock.masterIngredient.count.mockResolvedValue(120);
    const second = await asUser(request(app).get("/catalog/ingredients").query({ page: 2 }));
    expect(catalogCall()).toMatchObject({ skip: 20, take: 20 });
    expect(second.body).toMatchObject({ page: 2, limit: 20, total: 120, totalPages: 6 });

    vi.clearAllMocks();
    const capped = await asUser(request(app).get("/catalog/ingredients").query({ page: 3, limit: 500 }));
    expect(catalogCall()).toMatchObject({ skip: 100, take: 50 });
    expect(capped.body).toMatchObject({ limit: 50 });

    vi.clearAllMocks();
    await asUser(request(app).get("/catalog/ingredients").query({ page: "abc", limit: "0" }));
    expect(catalogCall()).toMatchObject({ skip: 0, take: 20 });
  });
});

describe("ingredient price (admin)", () => {
  const base = { name: "Thịt ba chỉ", category: "Thịt", defaultUnit: "KILOGRAM" };

  beforeEach(() => {
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.masterIngredient.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "i9", isActive: true, ...data }));
  });

  it("saves an optional whole-VND price, and an empty field as no price", async () => {
    const priced = await asAdmin(request(app).post("/ingredients")).send({ ...base, price: 135000 });
    expect(priced.status).toBe(201);
    expect(prismaMock.masterIngredient.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ price: 135000 }) });

    const cleared = await asAdmin(request(app).post("/ingredients")).send({ ...base, name: "Cá thu", price: "" });
    expect(cleared.status).toBe(201);
    expect(prismaMock.masterIngredient.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ price: null }) });
  });

  it("rejects a negative or fractional price", async () => {
    expect((await asAdmin(request(app).post("/ingredients")).send({ ...base, price: -1 })).status).toBe(400);
    expect((await asAdmin(request(app).post("/ingredients")).send({ ...base, price: 1500.5 })).status).toBe(400);
    expect(prismaMock.masterIngredient.create).not.toHaveBeenCalled();
  });
});
