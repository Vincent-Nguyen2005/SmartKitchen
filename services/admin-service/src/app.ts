import "express-async-errors";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import adminRouter from "./routes/admin.route";
import directoryRouter from "./routes/directory.route";
import { createShippersRouter } from "./routes/shippers.route";
import { createHealthMonitorRouter } from "./routes/health-monitor.route";
import { errorHandler } from "./middleware/error-handler";
import { prisma as defaultPrisma } from "./lib/prisma";
import { createHealthMonitor, type HealthMonitor } from "./jobs/health-monitor";
import { healthMonitorConfig, resolveHealthTargets } from "./config/health-targets";
import { createReportRouter } from "./routes/report.route";
import { createReporterNotifier, type ReporterNotifier } from "./lib/notify-client";

type AppDeps = { prisma?: typeof defaultPrisma; monitor?: HealthMonitor; notifier?: ReporterNotifier };

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const createDefaultNotifier = (): ReporterNotifier => createReporterNotifier({
  baseUrl: (process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4010").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://"),
  apiKey: process.env.INTERNAL_API_KEY,
  timeoutMs: positiveInt(process.env.NOTIFY_TIMEOUT_MS, 2000),
});

export const createDefaultMonitor = (prisma: typeof defaultPrisma = defaultPrisma): HealthMonitor => {
  const config = healthMonitorConfig();
  return createHealthMonitor({ prisma, targets: resolveHealthTargets(), timeoutMs: config.timeoutMs, degradedThresholdMs: config.degradedThresholdMs });
};

export const createApp = (deps: AppDeps = {}): express.Express => {
  const prisma = deps.prisma ?? defaultPrisma;
  const monitor = deps.monitor ?? createDefaultMonitor(prisma);
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/health-monitor", createHealthMonitorRouter(prisma, monitor));
  // User-facing report routes must be mounted before adminRouter (which requires ADMIN for everything after it).
  app.use("/reports", createReportRouter({
    prisma,
    notifier: deps.notifier ?? createDefaultNotifier(),
    maxReportsPerHour: positiveInt(process.env.REPORT_RATE_LIMIT_PER_HOUR, 5),
  }));
  // adminRouter serves public routes first, then enforces ADMIN before directory routes.
  app.use(adminRouter);
  app.use(directoryRouter);
  // Quản trị › Người giao hàng (ADMIN only).
  app.use(createShippersRouter(prisma));
  app.use(errorHandler);
  return app;
};
