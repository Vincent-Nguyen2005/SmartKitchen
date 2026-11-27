import "express-async-errors";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from ".prisma/client-notification";
import { createInternalRouter } from "./internal.route";
import { errorHandler } from "../middleware/error-handler";

const prismaMock = {
  notification: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  promotion: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  partnerSupermarket: { findFirst: vi.fn(), create: vi.fn() },
};
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/internal", createInternalRouter(prismaMock as unknown as PrismaClient));
  app.use(errorHandler);
  return app;
};
const valid = { userId: "user-1", title: "Báo cáo đã được xử lý", body: "Cảm ơn bạn", data: { reportId: "r1", status: "RESOLVED" } };

describe("POST /internal/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = "internal-test-key";
    prismaMock.notification.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "n1", ...data }));
  });
  afterEach(() => { delete process.env.INTERNAL_API_KEY; });

  it("creates a delivered in-app SYSTEM notification", async () => {
    const response = await request(buildApp()).post("/internal/notifications").set("x-api-key", "internal-test-key").send(valid);
    expect(response.status).toBe(201);
    const { data } = prismaMock.notification.create.mock.calls[0][0];
    expect(data).toMatchObject({ userId: "user-1", type: "SYSTEM", channel: "IN_APP", status: "SENT", data: { reportId: "r1", status: "RESOLVED" } });
    expect(data.sentAt).toBeInstanceOf(Date);
  });

  it("a dedupe key makes it idempotent: the second call answers the existing row and stores nothing", async () => {
    const order = { ...valid, title: "Đơn hàng đã giao thành công", data: { type: "order", orderId: "o1", status: "DELIVERED" }, dedupeKey: "order:o1:DELIVERED" };
    prismaMock.notification.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "n1", dedupeKey: "order:o1:DELIVERED" });
    const first = await request(buildApp()).post("/internal/notifications").set("x-api-key", "internal-test-key").send(order);
    const second = await request(buildApp()).post("/internal/notifications").set("x-api-key", "internal-test-key").send(order);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.create.mock.calls[0][0].data).toMatchObject({ dedupeKey: "order:o1:DELIVERED", channel: "IN_APP", status: "SENT" });
  });

  it("rejects a missing or wrong API key with 401 and stores nothing", async () => {
    expect((await request(buildApp()).post("/internal/notifications").send(valid)).status).toBe(401);
    expect((await request(buildApp()).post("/internal/notifications").set("x-api-key", "partner-key").send(valid)).status).toBe(401);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("rejects every call when INTERNAL_API_KEY is not configured", async () => {
    delete process.env.INTERNAL_API_KEY;
    expect((await request(buildApp()).post("/internal/notifications").set("x-api-key", "").send(valid)).status).toBe(401);
  });

  it("validates the payload and refuses PROMOTION type from internal callers", async () => {
    const app = buildApp();
    for (const body of [{ ...valid, userId: "" }, { ...valid, title: "" }, { ...valid, type: "PROMOTION" }, { ...valid, body: "x".repeat(2001) }]) {
      const response = await request(app).post("/internal/notifications").set("x-api-key", "internal-test-key").send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    }
  });

  it("maps a database outage to 503 DATABASE_UNAVAILABLE", async () => {
    prismaMock.notification.create.mockRejectedValue(Object.assign(new Error("db down"), { name: "PrismaClientInitializationError" }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(buildApp()).post("/internal/notifications").set("x-api-key", "internal-test-key").send(valid);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" });
  });
});

describe("internal promotion sync", () => {
  const KEY = "internal-test-key";
  const body = {
    title: "Cà chua giảm 20%", discountInfo: "20%", productKeywords: ["Cà Chua"],
    imageUrl: "https://cdn.example.com/ca-chua.jpg", startsAt: "2026-11-14T00:00:00.000Z", endsAt: "2026-11-21T16:59:59.999Z",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = KEY;
    prismaMock.partnerSupermarket.findFirst.mockResolvedValue(null);
    prismaMock.partnerSupermarket.create.mockResolvedValue({ id: "p1", name: "SmartKitchen" });
    prismaMock.promotion.upsert.mockImplementation(async ({ create }: { create: object }) => ({ id: "promo-1", ...create }));
    prismaMock.promotion.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => { delete process.env.INTERNAL_API_KEY; });

  it("requires the internal key (the partner key is not accepted)", async () => {
    expect((await request(buildApp()).put("/internal/promotions/admin-ingredient:i1").send(body)).status).toBe(401);
    expect((await request(buildApp()).put("/internal/promotions/admin-ingredient:i1").set("x-api-key", "partner-key").send(body)).status).toBe(401);
    expect((await request(buildApp()).post("/internal/promotions/admin-ingredient:i1/deactivate")).status).toBe(401);
    expect(prismaMock.promotion.upsert).not.toHaveBeenCalled();
  });

  it("upserts an active promotion by externalId and creates the SmartKitchen partner once", async () => {
    const response = await request(buildApp()).put("/internal/promotions/admin-ingredient:i1").set("x-api-key", KEY).send(body);
    expect(response.status).toBe(200);
    expect(prismaMock.partnerSupermarket.create).toHaveBeenCalledWith({ data: { name: "SmartKitchen" } });
    const call = prismaMock.promotion.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ externalId: "admin-ingredient:i1" });
    expect(call.update).toMatchObject({ title: "Cà chua giảm 20%", discountInfo: "20%", imageUrl: body.imageUrl, partnerId: "p1", isActive: true, productKeywords: ["ca chua"] });
    expect(call.create.externalId).toBe("admin-ingredient:i1");

    prismaMock.partnerSupermarket.findFirst.mockResolvedValue({ id: "p1", name: "SmartKitchen" });
    await request(buildApp()).put("/internal/promotions/admin-ingredient:i1").set("x-api-key", KEY).send({ ...body, imageUrl: null });
    expect(prismaMock.partnerSupermarket.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.promotion.upsert.mock.calls[1][0].update.imageUrl).toBeNull();
  });

  it("rejects non-https images, missing keywords and end before start", async () => {
    for (const bad of [{ ...body, imageUrl: "http://cdn.example.com/a.jpg" }, { ...body, productKeywords: [] }, { ...body, endsAt: "2026-11-01T00:00:00.000Z" }]) {
      expect((await request(buildApp()).put("/internal/promotions/admin-ingredient:i1").set("x-api-key", KEY).send(bad)).status).toBe(400);
    }
    expect(prismaMock.promotion.upsert).not.toHaveBeenCalled();
  });

  it("deactivates by externalId and treats unknown ids as a no-op", async () => {
    const response = await request(buildApp()).post("/internal/promotions/admin-ingredient:i1/deactivate").set("x-api-key", KEY);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deactivated: 1 });
    expect(prismaMock.promotion.updateMany).toHaveBeenCalledWith({ where: { externalId: "admin-ingredient:i1" }, data: { isActive: false } });
    prismaMock.promotion.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(buildApp()).post("/internal/promotions/admin-ingredient:unknown/deactivate").set("x-api-key", KEY)).body).toEqual({ deactivated: 0 });
  });
});

describe("promotion usage and delete (ingredient safe delete)", () => {
  const KEY = "internal-test-key";
  beforeEach(() => { vi.clearAllMocks(); process.env.INTERNAL_API_KEY = KEY; });
  afterEach(() => { delete process.env.INTERNAL_API_KEY; });

  it("reports whether the promotion exists, is running and was sent to users", async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(null);
    expect((await request(buildApp()).get("/internal/promotions/admin-ingredient:i1/usage").set("x-api-key", KEY)).body).toEqual({ exists: false, active: false, notified: 0 });
    const day = 24 * 3600 * 1000;
    prismaMock.promotion.findUnique.mockResolvedValue({ id: "p9", isActive: true, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day) });
    prismaMock.notification.count.mockResolvedValue(2);
    const response = await request(buildApp()).get("/internal/promotions/admin-ingredient:i1/usage").set("x-api-key", KEY);
    expect(response.body).toEqual({ exists: true, active: true, notified: 2 });
    expect(prismaMock.notification.count.mock.calls[0][0].where).toEqual({ type: "PROMOTION", data: { path: ["promotionId"], equals: "p9" } });
    prismaMock.promotion.findUnique.mockResolvedValue({ id: "p9", isActive: true, startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() - day) });
    prismaMock.notification.count.mockResolvedValue(0);
    expect((await request(buildApp()).get("/internal/promotions/admin-ingredient:i1/usage").set("x-api-key", KEY)).body.active).toBe(false);
  });

  it("deletes by externalId; needs the internal key", async () => {
    prismaMock.promotion.deleteMany.mockResolvedValue({ count: 1 });
    expect((await request(buildApp()).delete("/internal/promotions/admin-ingredient:i1")).status).toBe(401);
    const response = await request(buildApp()).delete("/internal/promotions/admin-ingredient:i1").set("x-api-key", KEY);
    expect(response.body).toEqual({ deleted: 1 });
    expect(prismaMock.promotion.deleteMany).toHaveBeenCalledTimes(1);
  });
});
