import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import itemsRouter from "./routes/items.route";
import alertsRouter from "./routes/alerts.route";
import { errorHandler } from "./middleware/error.middleware";
import { requireInventoryUser } from "./middleware/auth.middleware";
import { internalInventoryRouter, receiptRouter } from "./routes/capture.route";
import consumptionRouter from "./routes/consumption.route";
import { prisma } from "./lib/prisma";
import { ReceiptOcrService } from "./services/receipt-ocr.service";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.use("/health", healthRouter);
app.use("/api/inventory/internal", internalInventoryRouter);
app.use("/api/inventory", requireInventoryUser);
app.use("/api/inventory/items", itemsRouter);
app.use("/api/inventory/alerts", alertsRouter);
app.use("/api/inventory/consumption", consumptionRouter);
app.use("/api/inventory/receipts", receiptRouter);

// The gateway strips the `/api/inventory` prefix before proxying. Keep these
// authenticated mounts alongside the direct-service paths above.
app.use("/items", requireInventoryUser, itemsRouter);
app.use("/alerts", requireInventoryUser, alertsRouter);
app.use("/consumption", requireInventoryUser, consumptionRouter);
app.use("/receipts", requireInventoryUser, receiptRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4003;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[inventory-service] dang chay tai http://0.0.0.0:${PORT}`);
});

const shutdown = (): void => {
  server.close(() => {
    void Promise.all([prisma.$disconnect(), ReceiptOcrService.shutdown()]).finally(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
