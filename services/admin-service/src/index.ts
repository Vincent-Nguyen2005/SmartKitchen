import dotenv from "dotenv";

dotenv.config();

import { createApp, createDefaultMonitor } from "./app";
import { logProcessError } from "./middleware/error-handler";
import { prisma } from "./lib/prisma";
import { healthMonitorConfig } from "./config/health-targets";
import { purgeOldHealthLogs } from "./jobs/health-retention";
import { startHealthJobs } from "./jobs/scheduler";

const config = healthMonitorConfig();
const monitor = createDefaultMonitor(prisma);
const app = createApp({ prisma, monitor });

const PORT = process.env.PORT || 4011;
process.on("unhandledRejection", (error: unknown) => logProcessError("unhandled_rejection", error));
process.on("uncaughtException", (error: unknown) => logProcessError("uncaught_exception", error));
app.listen(PORT, () => {
  console.log(`[admin-service] dang chay tai http://localhost:${PORT}`);
  if (config.jobsEnabled) {
    startHealthJobs({ monitor, pollIntervalSeconds: config.pollIntervalSeconds, purge: () => purgeOldHealthLogs(prisma, config.retentionDays) });
    console.log(JSON.stringify({ event: "health_jobs_started", pollIntervalSeconds: config.pollIntervalSeconds, retentionDays: config.retentionDays }));
  }
});
