import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from ".prisma/client-admin";
import { requireAdmin } from "../middleware/require-admin";
import type { HealthMonitor } from "../jobs/health-monitor";
import { overallStatus, summarize, summaryWindows, type HealthStatus, type SummaryWindow } from "../lib/health-stats";

type MonitorPrisma = Pick<PrismaClient, "serviceHealthLog" | "$transaction">;

const historyQuery = z.object({
  service: z.string().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine((query) => !query.from || !query.to || query.from <= query.to, { message: "from must be before to", path: ["from"] });

const summaryQuery = z.object({ window: z.enum(["24h", "7d"]).default("24h") });

export const createHealthMonitorRouter = (prisma: MonitorPrisma, monitor: HealthMonitor): Router => {
  const router = Router();
  router.use(requireAdmin);
  const serviceNames = monitor.targets.map((target) => target.serviceName);

  router.get("/status", async (_request, response) => {
    const latest = await prisma.serviceHealthLog.findMany({
      distinct: ["serviceName"],
      orderBy: [{ serviceName: "asc" }, { checkedAt: "desc" }],
    });
    const byName = new Map(latest.map((row) => [row.serviceName, row]));
    const services = serviceNames.map((serviceName) => {
      const row = byName.get(serviceName);
      return { serviceName, status: (row?.status ?? null) as HealthStatus | null, responseTimeMs: row?.responseTimeMs ?? null, checkedAt: row?.checkedAt ?? null };
    });
    const checkedAt = latest.reduce<Date | null>((max, row) => (!max || row.checkedAt > max ? row.checkedAt : max), null);
    return response.json({ overall: overallStatus(services.map((service) => service.status)), checkedAt, services });
  });

  router.get("/history", async (request, response) => {
    const parsed = historyQuery.safeParse(request.query);
    if (!parsed.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "Invalid query", details: parsed.error.flatten() });
    const { service, from, to, page, limit } = parsed.data;
    const where = { serviceName: service, checkedAt: from || to ? { gte: from, lte: to } : undefined };
    const [items, total] = await prisma.$transaction([
      prisma.serviceHealthLog.findMany({ where, orderBy: { checkedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.serviceHealthLog.count({ where }),
    ]);
    return response.json({ items, page, limit, total });
  });

  router.get("/summary", async (request, response) => {
    const parsed = summaryQuery.safeParse(request.query);
    if (!parsed.success) return response.status(400).json({ error: "VALIDATION_ERROR", message: "window must be 24h or 7d", details: parsed.error.flatten() });
    const window: SummaryWindow = parsed.data.window;
    const to = new Date();
    const from = new Date(to.getTime() - summaryWindows[window]);
    const samples = await prisma.serviceHealthLog.findMany({
      where: { checkedAt: { gte: from, lte: to } },
      select: { serviceName: true, status: true, responseTimeMs: true, checkedAt: true },
    });
    const services = summarize(serviceNames, samples);
    return response.json({ window, from, to, overall: overallStatus(services.map((service) => service.lastStatus)), services });
  });

  router.post("/check-now", async (_request, response) => {
    const result = await monitor.poll();
    return response.status(result.persisted ? 200 : 503).json({
      checkedAt: result.checkedAt,
      persisted: result.persisted,
      joinedRunningPoll: Boolean(result.joined),
      overall: overallStatus(result.results.map((item) => item.status)),
      results: result.results,
      transitions: result.transitions,
    });
  });

  return router;
};
