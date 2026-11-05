import "express-async-errors";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from ".prisma/client-admin";
import { createReportRouter } from "./report.route";
import { errorHandler } from "../middleware/error-handler";

const prismaMock = {
  accountReport: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
};
const notifier = vi.fn();
const NOW = new Date("2026-11-04T10:00:00.000Z");

const buildApp = (maxReportsPerHour = 5) => {
  const app = express();
  app.use(express.json());
  app.use("/reports", createReportRouter({ prisma: prismaMock as unknown as PrismaClient, notifier, maxReportsPerHour, clock: () => NOW }));
  app.use(errorHandler);
  return app;
};
const asUser = (req: request.Test, id = "user-1") => req.set("x-user-id", id).set("x-user-role", "USER");
const asAdmin = (req: request.Test) => req.set("x-user-id", "admin-1").set("x-user-role", "ADMIN");
const report = (overrides: Record<string, unknown> = {}) => ({
  id: "r1", reporterUserId: "user-1", reportedUserId: "user-2", category: "ABUSE", description: "Rude messages in family chat",
  status: "OPEN", resolvedBy: null, resolutionNote: null, resolvedAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[]));
  notifier.mockResolvedValue("sent");
});

describe("POST /reports (user)", () => {
  const valid = { reportedUserId: "user-2", category: "ABUSE", description: "Rude messages in family chat" };

  it("requires an authenticated caller", async () => {
    const response = await request(buildApp()).post("/reports").send(valid);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("creates an OPEN report owned by the caller and hides the handling admin", async () => {
    prismaMock.accountReport.count.mockResolvedValue(0);
    prismaMock.accountReport.create.mockResolvedValue({ id: "r1", status: "OPEN" });
    const response = await asUser(request(buildApp()).post("/reports")).send({ ...valid, description: "  Rude messages in family chat  " });
    expect(response.status).toBe(201);
    const args = prismaMock.accountReport.create.mock.calls[0][0];
    expect(args.data).toEqual({ reportedUserId: "user-2", category: "ABUSE", description: "Rude messages in family chat", reporterUserId: "user-1", status: "OPEN" });
    expect(args.select.resolvedBy).toBeUndefined();
  });

  it.each<[Record<string, unknown>, string]>([
    [{ ...valid, category: "HACKING" }, "unknown category"],
    [{ ...valid, description: "too short" }, "description under 10 chars"],
    [{ ...valid, description: "x".repeat(2001) }, "description over 2000 chars"],
    [{ category: "BUG" }, "missing description"],
  ])("rejects invalid input (%#: %s) with 400", async (body) => {
    const response = await asUser(request(buildApp()).post("/reports")).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(prismaMock.accountReport.create).not.toHaveBeenCalled();
  });

  it("rejects reporting yourself", async () => {
    const response = await asUser(request(buildApp()).post("/reports")).send({ ...valid, reportedUserId: "user-1" });
    expect(response.status).toBe(400);
  });

  it("rate limits each user per rolling hour", async () => {
    prismaMock.accountReport.count.mockResolvedValue(3);
    const response = await asUser(request(buildApp(3)).post("/reports")).send(valid);
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: "RATE_LIMITED", retryAfterSeconds: 3600 });
    expect(prismaMock.accountReport.count).toHaveBeenCalledWith({ where: { reporterUserId: "user-1", createdAt: { gte: new Date("2026-11-04T09:00:00.000Z") } } });
    expect(prismaMock.accountReport.create).not.toHaveBeenCalled();
  });
});

describe("GET /reports/mine (user)", () => {
  it("lists only the caller's reports with paging", async () => {
    prismaMock.accountReport.findMany.mockResolvedValue([{ id: "r1" }]);
    prismaMock.accountReport.count.mockResolvedValue(1);
    const response = await asUser(request(buildApp()).get("/reports/mine?page=1&limit=10"), "user-9");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: "r1" }], page: 1, limit: 10, total: 1 });
    expect(prismaMock.accountReport.findMany.mock.calls[0][0]).toMatchObject({ where: { reporterUserId: "user-9" }, skip: 0, take: 10 });
  });

  it("is reachable by normal users but not anonymously", async () => {
    expect((await request(buildApp()).get("/reports/mine")).status).toBe(401);
  });
});

describe("admin report endpoints", () => {
  it("return 403 for non-admin callers", async () => {
    const app = buildApp();
    for (const [method, path] of [["get", "/reports"], ["get", "/reports/stats"], ["get", "/reports/r1"], ["patch", "/reports/r1/status"]] as const) {
      const response = await asUser(request(app)[method](path)).send({ status: "IN_REVIEW" });
      expect(response.status).toBe(403);
    }
  });

  it("lists with status/category filters and sort", async () => {
    prismaMock.accountReport.findMany.mockResolvedValue([]);
    prismaMock.accountReport.count.mockResolvedValue(0);
    const response = await asAdmin(request(buildApp()).get("/reports?status=OPEN&category=SPAM&sort=createdAt:asc&page=2&limit=5"));
    expect(response.status).toBe(200);
    expect(prismaMock.accountReport.findMany.mock.calls[0][0]).toEqual({ where: { status: "OPEN", category: "SPAM" }, orderBy: { createdAt: "asc" }, skip: 5, take: 5 });
    expect((await asAdmin(request(buildApp()).get("/reports?sort=random"))).status).toBe(400);
  });

  it("returns a report by id or 404", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report()).mockResolvedValueOnce(null);
    expect((await asAdmin(request(buildApp()).get("/reports/r1"))).body.id).toBe("r1");
    const missing = await asAdmin(request(buildApp()).get("/reports/nope"));
    expect(missing.status).toBe(404);
  });

  it("counts reports by every status and category, zero-filled", async () => {
    prismaMock.accountReport.groupBy
      .mockResolvedValueOnce([{ status: "OPEN", _count: { _all: 2 } }, { status: "RESOLVED", _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ category: "SPAM", _count: { _all: 3 } }]);
    const response = await asAdmin(request(buildApp()).get("/reports/stats"));
    expect(response.body).toEqual({
      total: 3,
      byStatus: { OPEN: 2, IN_REVIEW: 0, RESOLVED: 1, REJECTED: 0 },
      byCategory: { ABUSE: 0, SPAM: 3, BUG: 0, OTHER: 0 },
    });
  });
});

describe("PATCH /reports/:id/status", () => {
  const patch = (body: unknown) => asAdmin(request(buildApp()).patch("/reports/r1/status")).send(body as object);

  it.each([
    ["OPEN", "IN_REVIEW"],
    ["OPEN", "REJECTED"],
    ["IN_REVIEW", "RESOLVED"],
    ["IN_REVIEW", "REJECTED"],
  ])("allows %s -> %s", async (from, to) => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report({ status: from })).mockResolvedValueOnce(report({ status: to }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 1 });
    const response = await patch({ status: to, resolutionNote: "Checked the chat logs" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe(to);
  });

  it.each([
    ["OPEN", "RESOLVED"],
    ["IN_REVIEW", "IN_REVIEW"],
    ["RESOLVED", "REJECTED"],
    ["REJECTED", "IN_REVIEW"],
  ])("refuses %s -> %s with 409 and lists the allowed targets", async (from, to) => {
    prismaMock.accountReport.findUnique.mockResolvedValue(report({ status: from }));
    const response = await patch({ status: to, resolutionNote: "note" });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: "INVALID_TRANSITION", details: { currentStatus: from } });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("requires a resolution note for RESOLVED and REJECTED", async () => {
    for (const status of ["RESOLVED", "REJECTED"]) {
      const response = await patch({ status });
      expect(response.status).toBe(400);
      expect(response.body.details.fieldErrors.resolutionNote).toBeDefined();
    }
    expect(prismaMock.accountReport.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown reports", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValue(null);
    expect((await patch({ status: "IN_REVIEW" })).status).toBe(404);
  });

  it("writes the status change and the audit entry in the same transaction with an optimistic status check", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report({ status: "IN_REVIEW" })).mockResolvedValueOnce(report({ status: "RESOLVED", resolvedBy: "admin-1", resolutionNote: "Warned the user" }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 1 });
    const response = await patch({ status: "RESOLVED", resolutionNote: "Warned the user" });
    expect(response.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.accountReport.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: "IN_REVIEW" },
      data: { status: "RESOLVED", resolutionNote: "Warned the user", resolvedBy: "admin-1", resolvedAt: NOW },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: {
      adminUserId: "admin-1", action: "REPORT_STATUS_CHANGED", targetType: "AccountReport", targetId: "r1",
      metadata: { from: "IN_REVIEW", to: "RESOLVED", resolutionNote: "Warned the user" },
    } });
  });

  it("does not set resolvedBy when moving into review", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report()).mockResolvedValueOnce(report({ status: "IN_REVIEW" }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 1 });
    const response = await patch({ status: "IN_REVIEW" });
    expect(prismaMock.accountReport.updateMany.mock.calls[0][0].data).toEqual({ status: "IN_REVIEW" });
    expect(response.body.notification).toBe("skipped");
    expect(notifier).not.toHaveBeenCalled();
  });

  it("answers 409 CONFLICT without an audit entry when another admin handled it first", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValue(report({ status: "OPEN" }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 0 });
    const response = await patch({ status: "IN_REVIEW" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("notifies the reporter after resolution", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report({ status: "IN_REVIEW" })).mockResolvedValueOnce(report({ status: "RESOLVED", resolutionNote: "Done" }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 1 });
    const response = await patch({ status: "RESOLVED", resolutionNote: "Done" });
    expect(notifier).toHaveBeenCalledWith({ userId: "user-1", reportId: "r1", status: "RESOLVED", resolutionNote: "Done" });
    expect(response.body.notification).toBe("sent");
  });

  it("still resolves the report when the notification fails", async () => {
    prismaMock.accountReport.findUnique.mockResolvedValueOnce(report({ status: "OPEN" })).mockResolvedValueOnce(report({ status: "REJECTED", resolutionNote: "Not abusive" }));
    prismaMock.accountReport.updateMany.mockResolvedValue({ count: 1 });
    notifier.mockResolvedValue("failed");
    const response = await patch({ status: "REJECTED", resolutionNote: "Not abusive" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "REJECTED", notification: "failed" });
  });
});
