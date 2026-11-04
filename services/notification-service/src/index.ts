import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import promotionRouter from "./routes/promotion.route";
import cron from "node-cron";
import { dispatchActivePromotions } from "./services/promotion-dispatch.service";
import { errorHandler, logProcessError } from "./middleware/error-handler";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use(promotionRouter);
app.use(errorHandler);

// TODO: mount cac route nghiep vu cua notification-service tai day
// app.use("/api/notification", mainRouter);

const PORT = process.env.PORT || 4010;
if (process.env.ENABLE_JOBS !== "false") {
  cron.schedule(process.env.PROMOTION_CRON || "*/15 * * * *", () => { void dispatchActivePromotions().catch((error: unknown) => logProcessError("promotion_job_error", error)); });
}
process.on("unhandledRejection", (error: unknown) => logProcessError("unhandled_rejection", error));
process.on("uncaughtException", (error: unknown) => logProcessError("uncaught_exception", error));
app.listen(PORT, () => {
  console.log(`[notification-service] dang chay tai http://localhost:${PORT}`);
});
