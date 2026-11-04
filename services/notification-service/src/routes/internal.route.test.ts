import "express-async-errors";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from ".prisma/client-notification";
import { createInternalRouter } from "./internal.route";
import { errorHandler } from "../middleware/error-handler";

const prismaMock = { notification: { create: vi.fn() } };
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
