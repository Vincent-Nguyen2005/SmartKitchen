import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.route";
import recipeRouter from "./routes/recipe.route";

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/api/recipes", recipeRouter);
  // nutrition-service reads "/api/recipe" (singular) for its suggestions.
  app.use("/api/recipe", recipeRouter);
  // The gateway strips the "/api/recipes" prefix before proxying.
  app.use("/", recipeRouter);
  return app;
}
