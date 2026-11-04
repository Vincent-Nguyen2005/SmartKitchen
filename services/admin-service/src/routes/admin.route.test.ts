import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  recommendationWeight: { findUnique: vi.fn(), update: vi.fn() },
  recommendationWeightHistory: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import adminRouter from "./admin.route";

describe("recommendation weight optimistic locking", () => {
  const current = { id: "weight-1", key: "expiry_priority", value: 0.35, version: 1, description: null, updatedBy: "seed", updatedAt: new Date(), createdAt: new Date() };
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.recommendationWeight.findUnique.mockResolvedValue(current);
    prismaMock.recommendationWeight.update.mockResolvedValue({ ...current, value: 0.4, version: 2, updatedBy: "admin-1" });
    prismaMock.recommendationWeightHistory.create.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it("updates once and records history plus audit in one transaction", async () => {
    const app = express(); app.use(express.json()); app.use(adminRouter);
    const response = await request(app).put("/weights/expiry_priority").set("x-user-id", "admin-1").set("x-user-role", "ADMIN").send({ value: 0.4, expectedVersion: 1 });
    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.recommendationWeightHistory.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when expectedVersion is stale", async () => {
    const app = express(); app.use(express.json()); app.use(adminRouter);
    const response = await request(app).put("/weights/expiry_priority").set("x-user-id", "admin-1").set("x-user-role", "ADMIN").send({ value: 0.4, expectedVersion: 2 });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CONFLICT");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
