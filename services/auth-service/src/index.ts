import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client-auth";
import healthRouter from "./routes/health.route";
import createAuthRouter from "./routes/auth.routes";
import { createAdminUsersRouter } from "./routes/admin-users.routes";
import { createShippersRouter } from "./routes/shippers.routes";
import { isDatabaseUnavailable } from "./database-error";
import { seedAdmin } from "./seed-admin";
import type { ErrorRequestHandler } from "express";

dotenv.config();

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
}

const app = express();
const prisma = new PrismaClient();
const corsOptions: cors.CorsOptions = {
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204,
};
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

app.use("/health", healthRouter);

const authRouter = createAuthRouter(prisma);
app.use("/api/auth", authRouter);
app.use("/", authRouter);
app.use("/internal/admin/users", createAdminUsersRouter(prisma));
// Shipper accounts (admin-service) and the shipper status check (shopping-list-service).
app.use("/internal", createShippersRouter(prisma));

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("[auth-service] unhandled request error", error);
  if (res.headersSent) return;
  if (isDatabaseUnavailable(error)) {
    res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Auth database is unavailable" });
    return;
  }
  res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred" });
};
app.use(handleError);

const PORT = process.env.PORT || 4001;
let server: ReturnType<typeof app.listen> | undefined;
const start = async (): Promise<void> => {
  try {
    await prisma.$connect();
    const result = await seedAdmin(prisma);
    if (result === "skipped") console.warn("[auth-service] admin seed skipped: ADMIN_EMAIL or ADMIN_PASSWORD is missing");
    else console.log(`[auth-service] admin seed: ${result}`);
    server = app.listen(PORT, () => {
      console.log(`[auth-service] dang chay tai http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[auth-service] startup failed", error);
    await prisma.$disconnect();
    process.exitCode = 1;
  }
};
void start();

const shutdown = async (): Promise<void> => {
  server?.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
