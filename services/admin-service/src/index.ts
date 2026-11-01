import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import adminRouter from "./routes/admin.route";
import { errorHandler, logProcessError } from "./middleware/error-handler";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use(adminRouter);
app.use(errorHandler);

// TODO: mount cac route nghiep vu cua admin-service tai day
// app.use("/api/admin", mainRouter);

const PORT = process.env.PORT || 4011;
process.on("unhandledRejection", (error: unknown) => logProcessError("unhandled_rejection", error));
process.on("uncaughtException", (error: unknown) => logProcessError("uncaught_exception", error));
app.listen(PORT, () => {
  console.log(`[admin-service] dang chay tai http://localhost:${PORT}`);
});
