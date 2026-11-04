import "express-async-errors";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  deviceToken: { upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  notificationPreference: { upsert: vi.fn() },
  partnerSupermarket: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  promotion: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  notification: { findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const dispatchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../services/promotion-dispatch.service", () => ({ dispatchPromotion: dispatchMock }));

import promotionRouter from "./promotion.route";
import { errorHandler } from "../middleware/error-handler";

const app = express();
app.use(express.json());
app.use(promotionRouter);
app.use(errorHandler);
const KEY = "partner-test-key";
const promo = (overrides: Record<string, unknown> = {}) => ({ title: "Cà chua giảm giá", productKeywords: ["Cà Chua", "ca chua"], startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T00:00:00Z", ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARTNER_API_KEY = KEY;
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as unknown[]));
});
afterEach(() => { delete process.env.PARTNER_API_KEY; });

describe("device tokens", () => {
  it("registers (upserts) a device token and reactivates it", async () => {
    prismaMock.deviceToken.upsert.mockResolvedValue({ id: "d1" });
    const response = await request(app).post("/device-tokens").send({ userId: "u1", token: "ExponentPushToken[x]", platform: "ANDROID" });
    expect(response.status).toBe(201);
    expect(prismaMock.deviceToken.upsert.mock.calls[0][0]).toMatchObject({ where: { token: "ExponentPushToken[x]" }, update: { isActive: true } });
  });

  it("rejects an unknown platform with 400", async () => {
    expect((await request(app).post("/device-tokens").send({ userId: "u1", token: "t", platform: "WEB" })).status).toBe(400);
  });

  it("deactivates a token on DELETE (204)", async () => {
    prismaMock.deviceToken.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete("/device-tokens/abc")).status).toBe(204);
    expect(prismaMock.deviceToken.updateMany).toHaveBeenCalledWith({ where: { token: "abc" }, data: { isActive: false } });
  });
});

describe("preferences", () => {
  it("creates default preferences on first read", async () => {
    prismaMock.notificationPreference.upsert.mockResolvedValue({ userId: "u1", pushEnabled: true });
    expect((await request(app).get("/preferences/u1")).body.pushEnabled).toBe(true);
  });

  it("validates quiet hours as HH:mm and allows clearing them with null", async () => {
    prismaMock.notificationPreference.upsert.mockResolvedValue({});
    expect((await request(app).put("/preferences/u1").send({ quietHoursStart: "25:00" })).status).toBe(400);
    expect((await request(app).put("/preferences/u1").send({ quietHoursStart: "7:00" })).status).toBe(400);
    expect((await request(app).put("/preferences/u1").send({ quietHoursStart: "22:00", quietHoursEnd: null, promotionEnabled: false })).status).toBe(200);
    expect(prismaMock.notificationPreference.upsert.mock.calls[0][0].update).toEqual({ quietHoursStart: "22:00", quietHoursEnd: null, promotionEnabled: false });
  });
});

describe("partner ingestion (x-api-key)", () => {
  it("rejects partner calls without the right key", async () => {
    expect((await request(app).post("/partners").send({ name: "Mart" })).status).toBe(401);
    expect((await request(app).post("/partners").set("x-api-key", "wrong").send({ name: "Mart" })).status).toBe(401);
  });

  it("creates a partner (201) or returns the existing one (200)", async () => {
    prismaMock.partnerSupermarket.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "p1", name: "Mart" });
    prismaMock.partnerSupermarket.create.mockResolvedValue({ id: "p1", name: "Mart" });
    expect((await request(app).post("/partners").set("x-api-key", KEY).send({ name: "Mart" })).status).toBe(201);
    expect((await request(app).post("/partners").set("x-api-key", KEY).send({ name: "Mart" })).status).toBe(200);
  });

  it("ingests promotions with normalized, deduplicated keywords and upserts by title", async () => {
    prismaMock.partnerSupermarket.findUnique.mockResolvedValue({ id: "p1" });
    prismaMock.promotion.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" });
    prismaMock.promotion.create.mockImplementation(({ data }: { data: object }) => ({ id: "new", ...data }));
    prismaMock.promotion.update.mockImplementation(({ data }: { data: object }) => ({ id: "existing", ...data }));
    const response = await request(app).post("/partners/p1/promotions").set("x-api-key", KEY).send([promo(), promo({ title: "Thịt bò" })]);
    expect(response.status).toBe(201);
    expect(prismaMock.promotion.create.mock.calls[0][0].data.productKeywords).toEqual(["ca chua"]);
    expect(prismaMock.promotion.update).toHaveBeenCalledTimes(1);
  });

  it("limits a batch to 500 promotions and 404s unknown partners", async () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => promo({ title: `p${index}` }));
    expect((await request(app).post("/partners/p1/promotions").set("x-api-key", KEY).send(tooMany)).status).toBe(400);
    prismaMock.partnerSupermarket.findUnique.mockResolvedValue(null);
    expect((await request(app).post("/partners/missing/promotions").set("x-api-key", KEY).send([promo()])).status).toBe(404);
  });
});

describe("promotions and notifications", () => {
  it("lists promotions with keyword search, active filter and capped paging", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([]);
    prismaMock.promotion.count.mockResolvedValue(0);
    const response = await request(app).get("/promotions?active=true&keyword=ca&page=2&limit=500");
    expect(response.body).toEqual({ items: [], page: 2, limit: 100, total: 0 });
    const args = prismaMock.promotion.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ isActive: true, title: { contains: "ca", mode: "insensitive" } });
    expect(args.skip).toBe(100);
  });

  it("matches active promotions by normalized keyword", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([{ id: "a", productKeywords: ["ca chua"] }, { id: "b", productKeywords: ["thit bo"] }]);
    const response = await request(app).post("/promotions/match").send({ userId: "u1", keywords: ["Cà Chua"] });
    expect(response.body.promotions.map((item: { id: string }) => item.id)).toEqual(["a"]);
    expect((await request(app).post("/promotions/match").send({ userId: "u1", keywords: [] })).status).toBe(400);
  });

  it("lists a user's notifications and marks one as read", async () => {
    prismaMock.notification.findMany.mockResolvedValue([{ id: "n1" }]);
    prismaMock.notification.count.mockResolvedValue(1);
    expect((await request(app).get("/notifications?userId=u1&status=SENT")).body.total).toBe(1);
    expect(prismaMock.notification.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", status: "SENT" });
    prismaMock.notification.update.mockResolvedValue({ id: "n1", status: "READ" });
    expect((await request(app).patch("/notifications/n1/read")).body.status).toBe("READ");
  });

  it("maps marking an unknown notification as read to 404", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.notification.update.mockRejectedValue(Object.assign(new Error("not found"), { name: "PrismaClientKnownRequestError", code: "P2025" }));
    expect((await request(app).patch("/notifications/missing/read")).status).toBe(404);
  });

  it("dispatches to the given users or to every user with an active token", async () => {
    dispatchMock.mockResolvedValue(2);
    expect((await request(app).post("/promotions/p1/dispatch").send({ userIds: ["u1", "u2"] })).body).toEqual({ dispatched: 2 });
    expect(dispatchMock).toHaveBeenLastCalledWith("p1", ["u1", "u2"]);
    prismaMock.deviceToken.findMany.mockResolvedValue([{ userId: "u9" }]);
    await request(app).post("/promotions/p1/dispatch").send({});
    expect(dispatchMock).toHaveBeenLastCalledWith("p1", ["u9"]);
  });
});
