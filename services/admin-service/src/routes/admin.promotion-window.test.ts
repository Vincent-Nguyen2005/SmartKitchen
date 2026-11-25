import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const syncMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../lib/promotion-sync", async (importActual) => ({
  ...(await importActual<typeof import("../lib/promotion-sync")>()),
  promotionSync: { sync: syncMock },
}));

import adminRouter from "./admin.route";
import { errorHandler } from "../middleware/error-handler";
import { addDays, promotionPayload, promotionStatus, vnToday } from "../lib/promotion-sync";

const app = express().use(express.json()).use(adminRouter).use(errorHandler);
const admin = (req: request.Test) => req.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const base = { name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", allergenTags: [] };
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const today = vnToday();

beforeEach(() => {
  vi.clearAllMocks();
  syncMock.mockResolvedValue("synced");
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prismaMock) => unknown)(prismaMock)));
  prismaMock.masterIngredient.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "i1", ...data }));
  prismaMock.masterIngredient.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "i1", ...base, ...data }));
});

describe("promotion window (Vietnam days)", () => {
  it("status: before the first day upcoming; first through the whole last day running; the day after ended", () => {
    expect(promotionStatus("2026-12-01", "2026-12-07", "2026-11-30")).toBe("upcoming");
    expect(promotionStatus("2026-12-01", "2026-12-07", "2026-12-01")).toBe("running");
    expect(promotionStatus("2026-12-01", "2026-12-07", "2026-12-07")).toBe("running");
    expect(promotionStatus("2026-12-01", "2026-12-07", "2026-12-08")).toBe("ended");
    expect(promotionStatus(null, "2026-12-07", "2026-11-01")).toBe("running");
  });

  it("the synced promotion runs from 00:00 of the first day to 23:59:59.999 of the last day, Vietnam time", () => {
    const payload = promotionPayload({ id: "i1", name: "Cà chua", isActive: true, imageUrl: null, discountPercent: 20, promoStartDate: day("2026-12-01"), promoEndDate: day("2026-12-07") }, new Date("2026-11-24T03:00:00Z"));
    expect(payload.startsAt).toBe("2026-11-30T17:00:00.000Z");
    expect(payload.endsAt).toBe("2026-12-07T16:59:59.999Z");
  });
});

describe("admin form dates", () => {
  it("a discount without dates starts today and ends 7 days later", async () => {
    const response = await admin(request(app).post("/ingredients")).send({ ...base, discountPercent: 20 });
    expect(response.status).toBe(201);
    const data = prismaMock.masterIngredient.create.mock.calls[0][0].data;
    expect(data.promoStartDate).toEqual(day(today));
    expect(data.promoEndDate).toEqual(day(addDays(today, 7)));
  });

  it("end before start is rejected on the server (create and partial update), nothing saved", async () => {
    const tomorrow = addDays(today, 1);
    const late = await admin(request(app).post("/ingredients")).send({ ...base, discountPercent: 20, promoStartDate: addDays(today, 5), promoEndDate: tomorrow });
    expect(late.status).toBe(400);
    expect(late.body.details.fieldErrors.promoEndDate[0]).toContain("Ngày kết thúc");
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ id: "i1", ...base, imageUrl: null, discountPercent: 20, promoStartDate: day(addDays(today, 10)), promoEndDate: day(addDays(today, 20)) });
    expect((await admin(request(app).put("/ingredients/i1")).send({ promoEndDate: tomorrow })).status).toBe(400);
    expect(prismaMock.masterIngredient.create).not.toHaveBeenCalled();
    expect(prismaMock.masterIngredient.update).not.toHaveBeenCalled();
  });

  it("removing the discount clears both dates", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ id: "i1", ...base, imageUrl: null, discountPercent: 20, promoStartDate: day(today), promoEndDate: day(addDays(today, 7)) });
    await admin(request(app).put("/ingredients/i1")).send({ discountPercent: null });
    expect(prismaMock.masterIngredient.update.mock.calls[0][0].data).toMatchObject({ discountPercent: null, promoStartDate: null, promoEndDate: null });
  });
});

describe("Đi chợ shows a discount only while it runs", () => {
  it("an upcoming discount is not shown; a running one is (with its last day)", async () => {
    const row = (start: string, end: string) => ({ id: start, name: "Cà chua", category: "Rau củ", defaultUnit: "KILOGRAM", shelfLifeDays: 7, imageUrl: null, imageSource: null, imageAuthor: null, imageLicense: null, englishName: "tomato", discountPercent: 20, promoStartDate: day(start), promoEndDate: day(end), price: 30000 });
    prismaMock.masterIngredient.findMany.mockImplementation(async (args: { distinct?: string[] }) => (args.distinct ? [] : [row(addDays(today, 2), addDays(today, 9)), row(today, today)]));
    prismaMock.masterIngredient.count.mockResolvedValue(2);
    const response = await request(app).get("/catalog/ingredients").set("x-user-id", "u1").set("x-user-role", "USER");
    expect(response.body.items.map((item: { discountPercent: number | null; promoEndDate: string | null }) => [item.discountPercent, item.promoEndDate])).toEqual([[null, null], [20, today]]);
  });
});
