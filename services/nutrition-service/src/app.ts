import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import nutritionProfileRouter from "./routes/nutrition-profile.route";
import nutritionRouter from "./controllers/nutrition.controller";

export const createApp = (): express.Express => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/health", healthRouter);
  // Direct calls (unchanged from main): /api/nutrition-profile/*.
  app.use("/api/nutrition-profile", nutritionProfileRouter);
  // Hung's daily stats and suggestions, direct path.
  app.use("/api/nutrition", nutritionRouter);
  // The gateway forwards /api/nutrition/<path> as /<path> (prefix stripped), which is what the mobile app
  // calls: "" (profile), /allergies, /health-conditions, /user/profile/health, /daily-stats, /suggestions.
  app.use(nutritionRouter);
  app.use(nutritionProfileRouter);
  return app;
};
