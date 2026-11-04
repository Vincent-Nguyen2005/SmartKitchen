import "express-async-errors";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import adminRouter from "./routes/admin.route";
import { createHealthMonitorRouter } from "./routes/health-monitor.route";
import { errorHandler } from "./middleware/error-handler";
import { prisma as defaultPrisma } from "./lib/prisma";
import { createHealthMonitor, type HealthMonitor } from "./jobs/health-monitor";
import { healthMonitorConfig, resolveHealthTargets } from "./config/health-targets";

type AppDeps = { prisma?: typeof defaultPrisma; monitor?: HealthMonitor };

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
  // adminRouter applies requireAdmin to everything after its public routes, so mount it last.
  app.use(adminRouter);
  app.use(errorHandler);
  return app;
};
