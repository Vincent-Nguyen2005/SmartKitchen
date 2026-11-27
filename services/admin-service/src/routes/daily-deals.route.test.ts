import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  dailyDealSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  dailyDeal: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  masterIngredient: { findMany: vi.fn(async () => [{ id: "p1", name: "Cà chua", englishName: null, category: "Rau củ", isActive: true, price: 25000, discountPercent: null, promoStartDate: null, promoEndDate: null }]) },
  auditLog: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(),
}));
const store = vi.hoisted(() => ({
  ensureDay: vi.fn(async () => [{ productId: "p1", percent: 15, source: "MENU" }]),
  swapDeal: vi.fn(),
  clearDealCache: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../lib/daily-deal-store", async (importActual) => ({ ...(await importActual<typeof import("../lib/daily-deal-store")>()), ensureDay: store.ensureDay, swapDeal: store.swapDeal, clearDealCache: store.clearDealCache }));

import dailyDealsRouter from "./daily-deals.route";
import { errorHandler } from "../middleware/error-handler";

const app = express().use(express.json()).use(dailyDealsRouter).use(errorHandler);
const admin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const user = (test: request.Test) => test.set("x-user-id", "user-1").set("x-user-role", "USER");
const settings = { enabled: true, dealsPerDay: 10, minPercent: 5, maxPercent: 20, excludedProductIds: ["p9"] };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.dailyDealSettings.findUnique.mockResolvedValue(null);
  prismaMock.dailyDealSettings.upsert.mockImplementation(async ({ create }: { create: object }) => create);
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof prismaMock) => unknown) => run(prismaMock));
});

describe("Quản trị › Giảm giá tự động", () => {
  it("authorization: anonymous 401, USER 403 on every endpoint; nothing changes", async () => {
    expect((await request(app).get("/daily-deals")).status).toBe(401);
    for (const [method, path] of [["get", "/daily-deals"], ["put", "/daily-deals/settings"], ["post", "/daily-deals/today/reroll"], ["post", "/daily-deals/today/p1/swap"]] as const) {
      expect((await user(request(app)[method](path).send(settings))).status).toBe(403);
    }
    expect(prismaMock.dailyDealSettings.upsert).not.toHaveBeenCalled();
    expect(store.ensureDay).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("GET: default settings, today's list (name, %, applied), products for the exclusion list", async () => {
    const response = await admin(request(app).get("/daily-deals"));
    expect(response.status).toBe(200);
    expect(response.body.settings).toMatchObject({ enabled: true, dealsPerDay: 10, minPercent: 5, maxPercent: 20, excludedProductIds: [] });
    expect(response.body.deals).toEqual([{ productId: "p1", name: "Cà chua", group: "Rau củ", price: 25000, percent: 15, source: "MENU", status: "APPLIED" }]);
    expect(response.body.products).toEqual([{ id: "p1", name: "Cà chua", group: "Rau củ" }]);
  });

  it("settings: validated (1-30 per day, whole percents 1-50, min ≤ max), saved, audited, cache cleared", async () => {
    for (const bad of [{ dealsPerDay: 0 }, { dealsPerDay: 31 }, { minPercent: 25, maxPercent: 20 }, { maxPercent: 60 }, { minPercent: 7.5 }]) {
      const response = await admin(request(app).put("/daily-deals/settings").send({ ...settings, ...bad }));
      expect(response.status).toBe(400);
    }
    const tooHigh = await admin(request(app).put("/daily-deals/settings").send({ ...settings, minPercent: 25, maxPercent: 20 }));
    expect(tooHigh.body.details.fieldErrors).toEqual({ maxPercent: ["Mức cao nhất phải từ mức thấp nhất trở lên"] });
    expect(prismaMock.dailyDealSettings.upsert).not.toHaveBeenCalled();
    const saved = await admin(request(app).put("/daily-deals/settings").send({ ...settings, dealsPerDay: 12 }));
    expect(saved.status).toBe(200);
    expect(saved.body.settings).toEqual({ ...settings, dealsPerDay: 12 });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminUserId: "admin-1", action: "UPDATE_SETTINGS", targetType: "DailyDeal" }) });
    expect(store.clearDealCache).toHaveBeenCalled();
  });

  it("Chọn lại hôm nay and Đổi món are audited; a product not in today's list is 404, nothing eligible 409", async () => {
    expect((await admin(request(app).post("/daily-deals/today/reroll"))).status).toBe(200);
    expect(store.ensureDay).toHaveBeenCalledWith(expect.any(String), { reroll: true });
    store.swapDeal.mockResolvedValueOnce({ removed: "p1", added: { productId: "p2", percent: 10, source: "SWAP" } });
    expect((await admin(request(app).post("/daily-deals/today/p1/swap"))).status).toBe(200);
    expect((prismaMock.auditLog.create.mock.calls as unknown as Array<[{ data: { action: string } }]>).map((call) => call[0].data.action)).toEqual(["REROLL", "SWAP"]);
    store.swapDeal.mockResolvedValueOnce(null);
    expect((await admin(request(app).post("/daily-deals/today/zzz/swap"))).status).toBe(404);
    store.swapDeal.mockResolvedValueOnce(null);
    prismaMock.dailyDeal.count.mockResolvedValueOnce(1);
    expect((await admin(request(app).post("/daily-deals/today/p1/swap"))).status).toBe(409);
  });
});
