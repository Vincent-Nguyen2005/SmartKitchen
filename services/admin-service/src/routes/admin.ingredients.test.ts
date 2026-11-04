import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  masterIngredient: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  recommendationWeight: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  recommendationWeightHistory: { findMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import adminRouter from "./admin.route";
import { errorHandler } from "../middleware/error-handler";

const app = express();
app.use(express.json());
app.use(adminRouter);
app.use(errorHandler);
const admin = (req: request.Test) => req.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const ingredient = { name: "Cà Chua", category: "vegetable", defaultUnit: "g", caloriesPer100g: 18, allergenTags: [] };
const auditActions = () => prismaMock.auditLog.create.mock.calls.map((call) => call[0].data.action);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as unknown[]));
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("master ingredients", () => {
  it("requires the ADMIN role", async () => {
    expect((await request(app).get("/ingredients")).status).toBe(403);
  });

  it("searches by accent-insensitive normalized name with capped paging", async () => {
    prismaMock.masterIngredient.findMany.mockResolvedValue([]);
    prismaMock.masterIngredient.count.mockResolvedValue(0);
    const response = await admin(request(app).get("/ingredients?search=CÀ%20chua&isActive=true&limit=1000&sort=desc"));
    expect(response.body).toMatchObject({ page: 1, limit: 100, total: 0 });
    expect(prismaMock.masterIngredient.findMany.mock.calls[0][0]).toMatchObject({ where: { nameNormalized: { contains: "ca chua" }, isActive: true }, orderBy: { nameNormalized: "desc" } });
  });

  it("creates with nameNormalized and an audit entry in one transaction", async () => {
    prismaMock.masterIngredient.create.mockImplementation(({ data }: { data: object }) => ({ id: "i1", ...data }));
    const response = await admin(request(app).post("/ingredients")).send(ingredient);
    expect(response.status).toBe(201);
    expect(prismaMock.masterIngredient.create.mock.calls[0][0].data.nameNormalized).toBe("ca chua");
    expect(auditActions()).toEqual(["CREATE"]);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid ingredients with 400", async () => {
    for (const body of [{ ...ingredient, name: "" }, { ...ingredient, caloriesPer100g: -1 }, { ...ingredient, shelfLifeDays: 1.5 }]) {
      expect((await admin(request(app).post("/ingredients")).send(body)).status).toBe(400);
    }
    expect(prismaMock.masterIngredient.create).not.toHaveBeenCalled();
  });

  it("answers 409 for a duplicate name", async () => {
    prismaMock.masterIngredient.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const response = await admin(request(app).post("/ingredients")).send(ingredient);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CONFLICT");
  });

  it("updates with before/after audit and re-normalizes a renamed ingredient", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ id: "i1", name: "Ca chua" });
    prismaMock.masterIngredient.update.mockImplementation(({ data }: { data: object }) => ({ id: "i1", ...data }));
    const response = await admin(request(app).put("/ingredients/i1")).send({ name: "Cà Chua Bi" });
    expect(response.status).toBe(200);
    expect(prismaMock.masterIngredient.update.mock.calls[0][0].data.nameNormalized).toBe("ca chua bi");
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "UPDATE", metadata: { before: { id: "i1" } } });
  });

  it("soft deletes via isActive=false (never a hard delete) with an audit entry", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue({ id: "i1", isActive: true });
    prismaMock.masterIngredient.update.mockResolvedValue({ id: "i1", isActive: false });
    const response = await admin(request(app).patch("/ingredients/i1/active")).send({ isActive: false });
    expect(response.body.isActive).toBe(false);
    expect(prismaMock.masterIngredient.update.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(auditActions()).toEqual(["SET_ACTIVE"]);
  });

  it("returns 404 for unknown ingredients", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValue(null);
    expect((await admin(request(app).get("/ingredients/missing"))).status).toBe(404);
    expect((await admin(request(app).put("/ingredients/missing")).send({ category: "x" })).status).toBe(404);
    expect((await admin(request(app).patch("/ingredients/missing/active")).send({ isActive: false })).status).toBe(404);
  });

  it("imports up to 500 rows, creating new and updating existing ones with audit", async () => {
    prismaMock.masterIngredient.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "i2", name: "Hành" });
    prismaMock.masterIngredient.create.mockResolvedValue({ id: "i1" });
    prismaMock.masterIngredient.update.mockResolvedValue({ id: "i2" });
    const response = await admin(request(app).post("/ingredients/import")).send([ingredient, { ...ingredient, name: "Hành" }]);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ created: 1, updated: 1 });
    expect(auditActions()).toEqual(["IMPORT_CREATE", "IMPORT_UPDATE"]);
    const tooMany = Array.from({ length: 501 }, (_, index) => ({ ...ingredient, name: `n${index}` }));
    expect((await admin(request(app).post("/ingredients/import")).send(tooMany)).status).toBe(400);
  });

  it("exports the full catalog ordered by name", async () => {
    prismaMock.masterIngredient.findMany.mockResolvedValue([{ id: "i1" }]);
    expect((await admin(request(app).get("/ingredients/export"))).body).toEqual([{ id: "i1" }]);
  });
});

describe("recommendation weights", () => {
  const weight = { id: "w1", key: "expiry_priority", value: 0.5, version: 3, updatedAt: new Date("2026-11-01T00:00:00Z") };

  it("serves effective weights publicly with the max version", async () => {
    prismaMock.recommendationWeight.findMany.mockResolvedValue([weight, { ...weight, key: "nutrition_fit", value: 0.2, version: 5 }]);
    const response = await request(app).get("/weights/effective");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ weights: { expiry_priority: 0.5, nutrition_fit: 0.2 }, version: 5 });
  });

  it("rejects values outside 0..1, unknown keys and missing expectedVersion", async () => {
    expect((await admin(request(app).put("/weights/expiry_priority")).send({ value: 1.5, expectedVersion: 1 })).status).toBe(400);
    expect((await admin(request(app).put("/weights/expiry_priority")).send({ value: 0.5 })).status).toBe(400);
    expect((await admin(request(app).put("/weights/made_up")).send({ value: 0.5, expectedVersion: 1 })).status).toBe(404);
  });

  it("returns 409 with the current version for a stale expectedVersion", async () => {
    prismaMock.recommendationWeight.findUnique.mockResolvedValue(weight);
    const response = await admin(request(app).put("/weights/expiry_priority")).send({ value: 0.4, expectedVersion: 2 });
    expect(response.status).toBe(409);
    expect(response.body.currentVersion).toBe(3);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lists weights, one weight and its paged history", async () => {
    prismaMock.recommendationWeight.findMany.mockResolvedValue([weight]);
    prismaMock.recommendationWeight.findUnique.mockResolvedValueOnce(weight).mockResolvedValueOnce(weight).mockResolvedValueOnce(null);
    prismaMock.recommendationWeightHistory.findMany.mockResolvedValue([{ id: "h1" }]);
    expect((await admin(request(app).get("/weights"))).body).toHaveLength(1);
    expect((await admin(request(app).get("/weights/expiry_priority"))).body.key).toBe("expiry_priority");
    expect((await admin(request(app).get("/weights/expiry_priority/history?limit=5"))).body).toEqual([{ id: "h1" }]);
    expect((await admin(request(app).get("/weights/missing/history"))).status).toBe(404);
  });

  it("resets only weights that differ from the defaults, with history and audit", async () => {
    prismaMock.recommendationWeight.findUnique
      .mockResolvedValueOnce({ ...weight, value: 0.9 }) // expiry_priority differs
      .mockResolvedValueOnce({ ...weight, key: "nutrition_fit", value: 0.35 }) // already default
      .mockResolvedValueOnce(null); // preference_match not seeded
    prismaMock.recommendationWeight.update.mockResolvedValue({ ...weight, value: 0.35 });
    const response = await admin(request(app).post("/weights/reset-defaults"));
    expect(response.body.weights).toHaveLength(1);
    expect(prismaMock.recommendationWeightHistory.create).toHaveBeenCalledTimes(1);
    expect(auditActions()).toEqual(["RESET"]);
  });
});
