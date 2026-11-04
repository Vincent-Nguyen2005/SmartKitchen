import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  recommendationWeight: { findMany: vi.fn().mockResolvedValue([]) },
  serviceHealthLog: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn() },
  accountReport: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: "r1", status: "OPEN" }) },
  $transaction: vi.fn(),
}));
vi.mock("./lib/prisma", () => ({ prisma: prismaMock }));

import { createApp } from "./app";
import type { HealthMonitor } from "./jobs/health-monitor";

const monitor = { poll: vi.fn(), isRunning: () => false, targets: [{ serviceName: "gateway", url: "http://gateway:4000" }] } as unknown as HealthMonitor;

describe("admin app wiring", () => {
  it("serves /health without authentication", async () => {
    const response = await request(createApp({ monitor })).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "OK", service: "admin-service" });
  });

  it("keeps the public effective-weights endpoint reachable without the admin role", async () => {
    const response = await request(createApp({ monitor })).get("/weights/effective");
    expect(response.status).toBe(200);
  });

  it("mounts health monitoring behind require-admin", async () => {
    const app = createApp({ monitor });
    expect((await request(app).get("/health-monitor/status")).status).toBe(403);
    const admin = await request(app).get("/health-monitor/status").set("x-user-id", "a1").set("x-user-role", "ADMIN");
    expect(admin.status).toBe(200);
    expect(admin.body.overall).toBe("UNKNOWN");
  });

  it("lets normal users file reports (mounted before the admin-only router)", async () => {
    const response = await request(createApp({ monitor, notifier: vi.fn() })).post("/reports")
      .set("x-user-id", "user-1").set("x-user-role", "USER")
      .send({ category: "SPAM", description: "Sends spam links every day" });
    expect(response.status).toBe(201);
  });

  it("keeps the admin report list behind require-admin", async () => {
    const response = await request(createApp({ monitor, notifier: vi.fn() })).get("/reports").set("x-user-id", "user-1").set("x-user-role", "USER");
    expect(response.status).toBe(403);
  });

  it("builds a default monitor covering all twelve targets when none is injected", async () => {
    const response = await request(createApp()).get("/health-monitor/status").set("x-user-id", "a1").set("x-user-role", "ADMIN");
    expect(response.body.services).toHaveLength(12);
  });
});
