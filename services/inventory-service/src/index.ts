import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { ReceiptOcrService } from "./services/receipt-ocr.service";

const app = createApp();
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
