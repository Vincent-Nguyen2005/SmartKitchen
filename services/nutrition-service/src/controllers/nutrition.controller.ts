import { Router } from "express";
import { dailyStatsQuerySchema } from "../dto/nutrition.dto";
import { getUserId } from "../utils/auth";
import {
  getDailyNutritionStats,
  getPersonalizedSuggestions,
  NutritionProfileNotFoundError,
  NutritionUpstreamError,
} from "../services/nutrition.service";

const router = Router();

router.get("/daily-stats", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const query = dailyStatsQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({
      error: "A valid date in YYYY-MM-DD format is required.",
      details: query.error.flatten(),
    });
    return;
  }

  try {
    response.json(await getDailyNutritionStats(userId, query.data.date));
  } catch (error) {
    if (error instanceof NutritionProfileNotFoundError) {
      response.status(404).json({ error: "Nutrition profile not found." });
      return;
    }
    if (error instanceof NutritionUpstreamError) {
      response.status(502).json({ error: error.message });
      return;
    }
    response.status(500).json({ error: "Unable to calculate daily nutrition stats." });
  }
});

router.get("/suggestions", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;
  if (Object.keys(request.query).length > 0) {
    response.status(400).json({ error: "Suggestions do not accept query parameters." });
    return;
  }

  try {
    response.json(await getPersonalizedSuggestions(userId));
  } catch (error) {
    if (error instanceof NutritionProfileNotFoundError) {
      response.status(404).json({ error: "Nutrition profile not found." });
      return;
    }
    if (error instanceof NutritionUpstreamError) {
      response.status(502).json({ error: error.message });
      return;
    }
    response.status(500).json({ error: "Unable to load personalized suggestions." });
  }
});

export default router;
