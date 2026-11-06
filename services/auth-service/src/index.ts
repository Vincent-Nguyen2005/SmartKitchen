import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client-auth";
import healthRouter from "./routes/health.route";
import createAuthRouter from "./routes/auth.routes";
import { createAdminUsersRouter } from "./routes/admin-users.routes";

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
