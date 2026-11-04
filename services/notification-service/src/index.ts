import dotenv from "dotenv";

dotenv.config();

import cron from "node-cron";
import { createApp } from "./app";
import { dispatchActivePromotions } from "./services/promotion-dispatch.service";
import { logProcessError } from "./middleware/error-handler";

const app = createApp();

const PORT = process.env.PORT || 4010;
if (process.env.ENABLE_JOBS !== "false") {
  cron.schedule(process.env.PROMOTION_CRON || "*/15 * * * *", () => { void dispatchActivePromotions().catch((error: unknown) => logProcessError("promotion_job_error", error)); });
}
process.on("unhandledRejection", (error: unknown) => logProcessError("unhandled_rejection", error));
process.on("uncaughtException", (error: unknown) => logProcessError("uncaught_exception", error));
app.listen(PORT, () => {
  console.log(`[notification-service] dang chay tai http://localhost:${PORT}`);
});
