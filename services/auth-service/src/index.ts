import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health.route";
import createAuthRouter from "./routes/auth.routes";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

app.use("/api/auth", createAuthRouter(prisma));

const PORT = process.env.PORT || 4001;
const server = app.listen(PORT, () => {
  console.log(`[auth-service] dang chay tai http://localhost:${PORT}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
