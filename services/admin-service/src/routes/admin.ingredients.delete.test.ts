import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findUnique: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const usageMock = vi.hoisted(() => ({ check: vi.fn(), removePromotion: vi.fn() }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../lib/ingredient-usage", async (importOriginal) => ({ ...(await importOriginal<object>()), ingredientUsage: usageMock }));

import adminRouter from "./admin.route";
import { createIngredientUsage, UsageCheckError } from "../lib/ingredient-usage";

const app = express().use(express.json()).use(adminRouter);
const admin = (test: request.Test) => test.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const stored = { id: "i1", name: "Nước suối", isActive: true, discountPercent: null, promoEndDate: null };
const free = { inUse: false, reasons: [], promotionExists: false };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof prismaMock) => unknown) => run(prismaMock));
  prismaMock.masterIngredient.findUnique.mockResolvedValue(stored);
  prismaMock.masterIngredient.delete.mockResolvedValue(stored);
  prismaMock.auditLog.create.mockResolvedValue({});
  usageMock.check.mockResolvedValue(free);
  usageMock.removePromotion.mockResolvedValue(undefined);
});

describe("DELETE /ingredients/:id", () => {
  it("deletes an unreferenced ingredient and writes an audit row", async () => {
    const response = await admin(request(app).delete("/ingredients/i1"));
    expect(response.status).toBe(204);
    expect(prismaMock.masterIngredient.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "DELETE", targetId: "i1" });
    expect(usageMock.removePromotion).not.toHaveBeenCalled();
  });

  it("removes a synced promotion that was never sent together with the ingredient", async () => {
    usageMock.check.mockResolvedValue({ ...free, promotionExists: true });
    expect((await admin(request(app).delete("/ingredients/i1"))).status).toBe(204);
    expect(usageMock.removePromotion).toHaveBeenCalledWith("i1");
  });

  it("409 IN_USE when shopping lists or promotions point at it; nothing is deleted", async () => {
    usageMock.check.mockResolvedValue({ inUse: true, reasons: ["có trong 2 danh sách đi chợ"], promotionExists: false });
    const response = await admin(request(app).delete("/ingredients/i1"));
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "IN_USE", reasons: ["có trong 2 danh sách đi chợ"] });
    expect(prismaMock.masterIngredient.delete).not.toHaveBeenCalled();
  });

  it("409 IN_USE while the row's own discount is running", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ ...stored, discountPercent: 10, promoEndDate: null });
    const response = await admin(request(app).delete("/ingredients/i1"));
    expect(response.status).toBe(409);
    expect(response.body.reasons).toEqual(["đang có khuyến mãi"]);
  });

  it("503 and nothing deleted when a service cannot answer", async () => {
    usageMock.check.mockRejectedValue(new UsageCheckError("down"));
    expect((await admin(request(app).delete("/ingredients/i1"))).status).toBe(503);
    expect(prismaMock.masterIngredient.delete).not.toHaveBeenCalled();
  });

  it("404 for an unknown id; 403 for a non-admin", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue(null);
    expect((await admin(request(app).delete("/ingredients/nope"))).status).toBe(404);
    const forbidden = await request(app).delete("/ingredients/i1").set("x-user-id", "u1").set("x-user-role", "USER");
    expect(forbidden.status).toBe(403);
    expect(prismaMock.masterIngredient.delete).not.toHaveBeenCalled();
  });
});

describe("ingredient usage client", () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it("asks notification-service and shopping-list-service with the internal key", async () => {
    const calls: Array<{ url: string; method: string; key: string }> = [];
    const usage = createIngredientUsage({
      notificationUrl: "notification-service:4010", shoppingListUrl: "http://shopping-list-service:4008", apiKey: "k",
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, key: init.headers["x-api-key"] });
        return ok(url.includes("promotions") ? { exists: true, active: false, notified: 3 } : { items: 1 });
      },
    });
    expect(await usage.check("i1")).toEqual({ inUse: true, reasons: ["khuyến mãi đã gửi tới người dùng", "có trong 1 danh sách đi chợ"], promotionExists: true });
    expect(calls.map((call) => call.url).sort()).toEqual([
      "http://notification-service:4010/internal/promotions/admin-ingredient%3Ai1/usage",
      "http://shopping-list-service:4008/internal/products/i1/usage",
    ]);
    expect(calls.every((call) => call.key === "k" && call.method === "GET")).toBe(true);
  });

  it("a failed or missing answer is an error, never 'not used'", async () => {
    const down = createIngredientUsage({ notificationUrl: "http://n", shoppingListUrl: "http://s", apiKey: "k", fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await expect(down.check("i1")).rejects.toBeInstanceOf(UsageCheckError);
    const noKey = createIngredientUsage({ notificationUrl: "http://n", shoppingListUrl: "http://s", apiKey: undefined, fetchImpl: async () => ok({}) });
    await expect(noKey.check("i1")).rejects.toBeInstanceOf(UsageCheckError);
  });
});
