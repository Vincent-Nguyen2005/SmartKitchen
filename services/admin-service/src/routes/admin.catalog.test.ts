import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ masterIngredient: { findMany: vi.fn() } }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import adminRouter from "./admin.route";

const app = express().use(express.json()).use(adminRouter);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.masterIngredient.findMany.mockResolvedValue([{ id: "i1", name: "Cà chua", category: "vegetable", defaultUnit: "KILOGRAM", shelfLifeDays: 7 }]);
});

it("lets a normal signed-in user read active catalog rows with public fields only", async () => {
  const response = await request(app).get("/catalog/ingredients?q=C%C3%A0%20Chua").set("x-user-id", "user-1").set("x-user-role", "USER");
  expect(response.status).toBe(200);
  expect(response.body.items).toEqual([{ id: "i1", name: "Cà chua", category: "vegetable", defaultUnit: "KILOGRAM", shelfLifeDays: 7 }]);
  expect(prismaMock.masterIngredient.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { isActive: true, nameNormalized: { contains: "ca chua" } },
    select: { id: true, name: true, category: true, defaultUnit: true, shelfLifeDays: true },
  }));
});

it("requires a signed-in user and keeps the admin list admin-only", async () => {
  expect((await request(app).get("/catalog/ingredients")).status).toBe(401);
  expect((await request(app).get("/ingredients").set("x-user-id", "user-1").set("x-user-role", "USER")).status).toBe(403);
});
