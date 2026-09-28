import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health.route";
import createRecipesRouter from "./routes/recipes.route";

dotenv.config();

const app = express();
app.disable('x-powered-by');
const prisma = new PrismaClient();
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  credentials: true,
}));
app.use(express.json());

app.use("/health", healthRouter);
app.use(createRecipesRouter(prisma));

const PORT = process.env.PORT || 4006;
const server = app.listen(PORT, () => {
  console.log(`[recipe-service] dang chay tai http://localhost:${PORT}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
