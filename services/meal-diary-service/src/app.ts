import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import mealDiaryRouter from "./controllers/meal-diary.controller";

export const createApp = (): express.Express => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/health", healthRouter);
  // Direct / service-to-service calls use /api/meal-diary/* (nutrition-service calls
  // /api/meal-diary/daily-summary). The gateway strips its /api/meal-diary prefix before proxying,
  // so the same routes are also mounted at the root.
  app.use("/api/meal-diary", mealDiaryRouter);
  app.use(mealDiaryRouter);
  return app;
};
