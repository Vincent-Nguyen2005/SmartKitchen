import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client-family";
import healthRouter from "./routes/health.route";
import createFamilyRouter from "./routes/family.routes";
import { createAdminFamiliesRouter } from "./routes/admin-families.routes";
import { isDatabaseUnavailable } from "./database-error";
import type { ErrorRequestHandler } from "express";

dotenv.config();

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
}

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);

app.use("/internal/admin/families", createAdminFamiliesRouter(prisma));
const familyRouter = createFamilyRouter(prisma);
app.use("/api/family", familyRouter); // direct-service compatibility
app.use("/", familyRouter); // gateway strips /api/families

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("[family-service] unhandled request error", error);
  if (res.headersSent) return;
  if (isDatabaseUnavailable(error)) {
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Family database is unavailable" });
    return;
  }
  res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
};
app.use(handleError);

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
