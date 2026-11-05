import "express-async-errors";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import promotionRouter from "./routes/promotion.route";
import { createInternalRouter } from "./routes/internal.route";
import { errorHandler } from "./middleware/error-handler";
import { prisma as defaultPrisma } from "./lib/prisma";

export const createApp = (prisma: typeof defaultPrisma = defaultPrisma): express.Express => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/internal", createInternalRouter(prisma));
  app.use(promotionRouter);
  app.use(errorHandler);
  return app;
};
