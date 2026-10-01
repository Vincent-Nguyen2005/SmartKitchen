import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health.route";
import createFamilyRouter from "./routes/family.routes";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

app.use("/api/family", createFamilyRouter(prisma));

const PORT = process.env.PORT || 4002;
const server = app.listen(PORT, () => {
  console.log(`[family-service] dang chay tai http://localhost:${PORT}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
