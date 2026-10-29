import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import healthRouter from "./routes/health.route";
import createAuthRouter from "./routes/auth.routes";

dotenv.config();

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
}

const app = express();
const prisma = new PrismaClient();
const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
}));
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
