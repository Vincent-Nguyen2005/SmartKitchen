import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.route";
import menuRouter from "./routes/menu.route";
import { PrismaClient } from "../node_modules/.prisma/client-menu";
import { lookupMemberships } from "./services/family-client";
import { runFamilyBackfillAtStartup } from "./services/family-backfill";
import { createInternalRouter } from "./routes/internal.route";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
// Service-to-service (recipe-service delete check); before the menu routes so "/internal" is never read as a menu id.
app.use("/internal", createInternalRouter(new PrismaClient()));
app.use("/api/menu", menuRouter);
app.use("/api/menus", menuRouter);
app.use("/", menuRouter);

const PORT = process.env.PORT || 4007;
app.listen(PORT, () => {
  console.log(`[menu-service] dang chay tai http://localhost:${PORT}`);
  // Menus belong to families: map older menus, dislike history and settings to families (idempotent, counts only).
  void runFamilyBackfillAtStartup(new PrismaClient(), lookupMemberships);
});
