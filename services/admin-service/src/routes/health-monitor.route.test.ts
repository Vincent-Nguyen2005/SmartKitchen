import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from ".prisma/client-admin";
import { createHealthMonitorRouter } from "./health-monitor.route";
import type { HealthMonitor } from "../jobs/health-monitor";
import { errorHandler } from "../middleware/error-handler";

const prismaMock = {
  serviceHealthLog: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
};
const monitorMock = {
  poll: vi.fn(),
  isRunning: vi.fn(() => false),
  targets: [{ serviceName: "auth-service", url: "http://auth:4001" }, { serviceName: "gateway", url: "http://gateway:4000" }],
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/health-monitor", createHealthMonitorRouter(prismaMock as unknown as PrismaClient, monitorMock as unknown as HealthMonitor));
  app.use(errorHandler);
  return app;
};
const asAdmin = (req: request.Test) => req.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");

describe("health monitor routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("rejects non-admin callers with 403 on every endpoint", async () => {
    const app = buildApp();
    for (const [method, path] of [["get", "/status"], ["get", "/history"], ["get", "/summary"], ["post", "/check-now"]] as const) {
      const response = await request(app)[method](`/health-monitor${path}`).set("x-user-id", "u1").set("x-user-role", "USER");
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("FORBIDDEN");
    }
    expect(monitorMock.poll).not.toHaveBeenCalled();
  });

  it("returns the latest status per configured service with an overall status", async () => {
    const checkedAt = new Date("2026-11-04T01:00:00.000Z");
    prismaMock.serviceHealthLog.findMany.mockResolvedValue([{ serviceName: "auth-service", status: "DOWN", responseTimeMs: null, checkedAt }]);
    const response = await asAdmin(request(buildApp()).get("/health-monitor/status"));
    expect(response.status).toBe(200);
    expect(response.body.overall).toBe("DEGRADED");
    expect(response.body.checkedAt).toBe(checkedAt.toISOString());
    expect(response.body.services).toEqual([
      { serviceName: "auth-service", status: "DOWN", responseTimeMs: null, checkedAt: checkedAt.toISOString() },
      { serviceName: "gateway", status: null, responseTimeMs: null, checkedAt: null },
    ]);
  });

  it("pages history with filters and caps limit at 200", async () => {
    prismaMock.serviceHealthLog.findMany.mockResolvedValue([]);
    prismaMock.serviceHealthLog.count.mockResolvedValue(0);
    const ok = await asAdmin(request(buildApp()).get("/health-monitor/history?service=gateway&from=2026-11-01&to=2026-11-04&page=2&limit=200"));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ items: [], page: 2, limit: 200, total: 0 });
    expect(prismaMock.serviceHealthLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { serviceName: "gateway", checkedAt: { gte: new Date("2026-11-01"), lte: new Date("2026-11-04") } },
      skip: 200, take: 200,
    }));
    const tooBig = await asAdmin(request(buildApp()).get("/health-monitor/history?limit=201"));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toBe("VALIDATION_ERROR");
  });

  it("rejects history ranges where from is after to", async () => {
    const response = await asAdmin(request(buildApp()).get("/health-monitor/history?from=2026-11-05&to=2026-11-01"));
    expect(response.status).toBe(400);
  });

  it("summarizes uptime and response times for the requested window", async () => {
    const at = (minute: number) => new Date(Date.now() - minute * 60_000);
    prismaMock.serviceHealthLog.findMany.mockResolvedValue([
      { serviceName: "auth-service", status: "UP", responseTimeMs: 10, checkedAt: at(3) },
      { serviceName: "auth-service", status: "DOWN", responseTimeMs: null, checkedAt: at(2) },
      { serviceName: "gateway", status: "UP", responseTimeMs: 40, checkedAt: at(1) },
    ]);
    const response = await asAdmin(request(buildApp()).get("/health-monitor/summary?window=7d"));
    expect(response.status).toBe(200);
    expect(response.body.window).toBe("7d");
    expect(new Date(response.body.to).getTime() - new Date(response.body.from).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const auth = response.body.services.find((row: { serviceName: string }) => row.serviceName === "auth-service");
    expect(auth).toMatchObject({ samples: 2, uptimePercent: 50, avgResponseTimeMs: 10, p95ResponseTimeMs: 10, lastStatus: "DOWN" });
    expect(response.body.overall).toBe("DEGRADED");
  });

  it("defaults the summary window to 24h and rejects unknown windows", async () => {
    prismaMock.serviceHealthLog.findMany.mockResolvedValue([]);
    expect((await asAdmin(request(buildApp()).get("/health-monitor/summary"))).body.window).toBe("24h");
    expect((await asAdmin(request(buildApp()).get("/health-monitor/summary?window=30d"))).status).toBe(400);
  });

  it("runs one poll on check-now and reports transitions", async () => {
    monitorMock.poll.mockResolvedValue({
      checkedAt: new Date("2026-11-04T02:00:00.000Z"), persisted: true,
      results: [{ serviceName: "auth-service", status: "UP", responseTimeMs: 5 }, { serviceName: "gateway", status: "UP", responseTimeMs: 7 }],
      transitions: [{ serviceName: "auth-service", from: "DOWN", to: "UP" }],
    });
    const response = await asAdmin(request(buildApp()).post("/health-monitor/check-now"));
    expect(response.status).toBe(200);
    expect(monitorMock.poll).toHaveBeenCalledTimes(1);
    expect(response.body).toMatchObject({ overall: "UP", persisted: true, joinedRunningPoll: false, transitions: [{ serviceName: "auth-service", from: "DOWN", to: "UP" }] });
  });

  it("answers 503 from check-now when results could not be stored", async () => {
    monitorMock.poll.mockResolvedValue({ checkedAt: new Date(), persisted: false, joined: true, results: [], transitions: [] });
    const response = await asAdmin(request(buildApp()).post("/health-monitor/check-now"));
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ persisted: false, joinedRunningPoll: true });
  });

  it("maps database outages to 503 DATABASE_UNAVAILABLE without leaking a stack trace", async () => {
    const outage = Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError" });
    prismaMock.serviceHealthLog.findMany.mockRejectedValue(outage);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await asAdmin(request(buildApp()).get("/health-monitor/status"));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "DATABASE_UNAVAILABLE", message: "Database is unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("at ");
  });
});
