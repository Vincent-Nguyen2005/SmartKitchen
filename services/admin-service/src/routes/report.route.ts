import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from ".prisma/client-admin";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { callerUserId, requireUser } from "../middleware/require-user";
import { allowedTransitions, canTransition, isFinalStatus, type ReportStatus } from "../lib/report-transitions";
import type { ReporterNotifier } from "../lib/notify-client";

type ReportPrisma = Pick<PrismaClient, "accountReport" | "auditLog" | "$transaction">;
type ReportDeps = { prisma: ReportPrisma; notifier: ReporterNotifier; maxReportsPerHour: number; clock?: () => Date };

const categories = ["ABUSE", "SPAM", "BUG", "OTHER"] as const;
const statuses = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] as const;
const HOUR_MS = 60 * 60 * 1000;

const createSchema = z.object({
  reportedUserId: z.string().trim().min(1).max(200).optional(),
  category: z.enum(categories),
  description: z.string().trim().min(10).max(2000),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const listSchema = pageSchema.extend({
  status: z.enum(statuses).optional(),
  category: z.enum(categories).optional(),
  sort: z.enum(["createdAt:desc", "createdAt:asc", "updatedAt:desc", "updatedAt:asc"]).default("createdAt:desc"),
});
const statusSchema = z.object({
  status: z.enum(["IN_REVIEW", "RESOLVED", "REJECTED"]),
  resolutionNote: z.string().trim().min(1).max(2000).optional(),
}).refine((body) => !isFinalStatus(body.status) || Boolean(body.resolutionNote), {
  message: "resolutionNote is required for RESOLVED and REJECTED",
  path: ["resolutionNote"],
});

// Reporter-facing projection: the handling admin's id stays internal.
const mineSelect = { id: true, reportedUserId: true, category: true, description: true, status: true, resolutionNote: true, resolvedAt: true, createdAt: true, updatedAt: true } as const;

const validationError = (details: unknown) => ({ error: "VALIDATION_ERROR", message: "Invalid request", details });

// Optional window for /stats: adds how many reports were resolved within it (dashboard KPI).
const statsWindows = { "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS } as const;
const statsSchema = z.object({ window: z.enum(["24h", "7d"]).optional() });

export const createReportRouter = ({ prisma, notifier, maxReportsPerHour, clock = () => new Date() }: ReportDeps): Router => {
  const router = Router();

  // ---- user-facing (any authenticated caller) ----
  router.post("/", requireUser, async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.flatten()));
    const reporterUserId = callerUserId(request);
    if (parsed.data.reportedUserId === reporterUserId) {
      return response.status(400).json({ error: "VALIDATION_ERROR", message: "You cannot report yourself" });
    }
    const recent = await prisma.accountReport.count({ where: { reporterUserId, createdAt: { gte: new Date(clock().getTime() - HOUR_MS) } } });
    if (recent >= maxReportsPerHour) {
      return response.status(429).json({ error: "RATE_LIMITED", message: `At most ${maxReportsPerHour} reports per hour`, retryAfterSeconds: 3600 });
    }
    const report = await prisma.accountReport.create({ data: { ...parsed.data, reporterUserId, status: "OPEN" }, select: mineSelect });
    return response.status(201).json(report);
  });

  router.get("/mine", requireUser, async (request, response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.flatten()));
    const { page, limit } = parsed.data;
    const where = { reporterUserId: callerUserId(request) };
    const [items, total] = await prisma.$transaction([
      prisma.accountReport.findMany({ where, select: mineSelect, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.accountReport.count({ where }),
    ]);
    return response.json({ items, page, limit, total });
  });

  // ---- admin-only ----
  router.get("/stats", requireAdmin, async (request, response) => {
    const parsed = statsSchema.safeParse(request.query);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.flatten()));
    const { window } = parsed.data;
    const since = window ? new Date(clock().getTime() - statsWindows[window]) : null;
    const [byStatus, byCategory, resolvedInWindow] = await Promise.all([
      prisma.accountReport.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.accountReport.groupBy({ by: ["category"], _count: { _all: true } }),
      since ? prisma.accountReport.count({ where: { status: "RESOLVED", resolvedAt: { gte: since } } }) : Promise.resolve(null),
    ]);
    // Zero-fill so every status/category is always present.
    const fill = (keys: readonly string[], counts: Map<string, number>) => Object.fromEntries(keys.map((name) => [name, counts.get(name) ?? 0]));
    const status = fill(statuses, new Map(byStatus.map((row) => [row.status, row._count._all])));
    const category = fill(categories, new Map(byCategory.map((row) => [row.category, row._count._all])));
    const total = Object.values(status).reduce((sum, value) => sum + value, 0);
    // Without ?window the response is unchanged.
    return response.json({ total, byStatus: status, byCategory: category, ...(window ? { window, resolvedInWindow } : {}) });
  });

  router.get("/", requireAdmin, async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.flatten()));
    const { page, limit, status, category, sort } = parsed.data;
    const [field, direction] = sort.split(":") as ["createdAt" | "updatedAt", "asc" | "desc"];
    const where = { status, category };
    const [items, total] = await prisma.$transaction([
      prisma.accountReport.findMany({ where, orderBy: { [field]: direction }, skip: (page - 1) * limit, take: limit }),
      prisma.accountReport.count({ where }),
    ]);
    return response.json({ items, page, limit, total });
  });

  router.get("/:id", requireAdmin, async (request, response) => {
    const report = await prisma.accountReport.findUnique({ where: { id: request.params.id } });
    return report ? response.json(report) : response.status(404).json({ error: "NOT_FOUND", message: "Report not found" });
  });

  router.patch("/:id/status", requireAdmin, async (request, response) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(validationError(parsed.error.flatten()));
    const current = await prisma.accountReport.findUnique({ where: { id: request.params.id } });
    if (!current) return response.status(404).json({ error: "NOT_FOUND", message: "Report not found" });
    const from = current.status as ReportStatus;
    const to = parsed.data.status;
    if (!canTransition(from, to)) {
      return response.status(409).json({ error: "INVALID_TRANSITION", message: `Cannot change status from ${from} to ${to}`, details: { currentStatus: from, allowed: allowedTransitions[from] } });
    }

    const actor = adminUserId(request);
    const now = clock();
    const data = isFinalStatus(to)
      ? { status: to, resolutionNote: parsed.data.resolutionNote, resolvedBy: actor, resolvedAt: now }
      : { status: to, ...(parsed.data.resolutionNote ? { resolutionNote: parsed.data.resolutionNote } : {}) };

    const updated = await prisma.$transaction(async (tx) => {
      // Optimistic check: only succeeds if nobody changed the status since we read it.
      const result = await tx.accountReport.updateMany({ where: { id: current.id, status: from }, data });
      if (result.count === 0) return null;
      await tx.auditLog.create({
        data: { adminUserId: actor, action: "REPORT_STATUS_CHANGED", targetType: "AccountReport", targetId: current.id, metadata: { from, to, resolutionNote: parsed.data.resolutionNote ?? null } },
      });
      return tx.accountReport.findUnique({ where: { id: current.id } });
    });
    if (!updated) {
      return response.status(409).json({ error: "CONFLICT", message: "Report was updated by another administrator; reload and retry" });
    }

    // Best effort and outside the transaction: a notification failure never undoes the resolution.
    const notification = isFinalStatus(to)
      ? await notifier({ userId: updated.reporterUserId, reportId: updated.id, status: to, resolutionNote: updated.resolutionNote })
      : "skipped";
    return response.json({ ...updated, notification });
  });

  return router;
};
