import "express-async-errors";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

// Real promotion sync (not mocked) against a port where nothing listens.
const prismaMock = vi.hoisted(() => ({
  masterIngredient: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import adminRouter from "./admin.route";

const saved = { url: process.env.NOTIFICATION_SERVICE_URL, key: process.env.INTERNAL_API_KEY };

beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  process.env.NOTIFICATION_SERVICE_URL = `http://127.0.0.1:${port}`;
  process.env.INTERNAL_API_KEY = "internal-test-key-with-more-than-32-characters";
});
afterAll(() => {
  for (const [key, value] of Object.entries({ NOTIFICATION_SERVICE_URL: saved.url, INTERNAL_API_KEY: saved.key })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it("saves the ingredient and answers promotionSync failed when notification-service is unreachable", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.masterIngredient.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "i1", isActive: true, ...data }));
  const app = express().use(express.json()).use(adminRouter);
  const response = await request(app).post("/ingredients").set("x-user-id", "admin-1").set("x-user-role", "ADMIN")
    .send({ name: "Cà chua", category: "vegetable", defaultUnit: "g", discountPercent: 20 });
  expect(response.status).toBe(201);
  expect(response.body).toMatchObject({ id: "i1", discountPercent: 20, promotionSync: "failed" });
  expect(prismaMock.masterIngredient.create).toHaveBeenCalledTimes(1);
});
