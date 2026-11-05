import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  mealHistoryQuerySchema,
  mealLogSchema,
} from "../dto/meal-diary.dto";
import {
  createMealDiary,
  deleteMealDiary,
  getDailyMealSummary,
  getMealHistory,
} from "../services/meal-diary.service";

const router = Router();

function getUserId(request: Request, response: Response): string | undefined {
  const userId = request.header("X-User-Id");
  if (!userId || !z.string().uuid().safeParse(userId).success) {
    response.status(401).json({ error: "A valid authenticated user is required." });
    return undefined;
  }
  return userId;
}

router.post("/meals/log", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = mealLogSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid meal log.",
      details: result.error.flatten(),
    });
    return;
  }

  try {
    response.status(201).json(await createMealDiary(userId, result.data));
  } catch {
    response.status(500).json({ error: "Unable to save meal diary entry." });
  }
});

router.get("/meals/history", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = mealHistoryQuerySchema.safeParse(request.query);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid meal history date.",
      details: result.error.flatten(),
    });
    return;
  }

  try {
    response.json(await getMealHistory(userId, result.data.date));
  } catch {
    response.status(500).json({ error: "Unable to load meal history." });
  }
});

router.get("/daily-summary", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;

  const result = mealHistoryQuerySchema.safeParse(request.query);
  if (!result.success) {
    response.status(400).json({
      error: "Invalid daily summary date.",
      details: result.error.flatten(),
    });
    return;
  }

  try {
    response.json(await getDailyMealSummary(userId, result.data.date));
  } catch {
    response.status(500).json({ error: "Unable to load daily meal summary." });
  }
});

router.delete("/meals/:id", async (request, response) => {
  const userId = getUserId(request, response);
  if (!userId) return;
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "A valid meal diary ID is required." });
    return;
  }

  try {
    if (!(await deleteMealDiary(userId, id.data))) {
      response.status(404).json({ error: "Meal diary entry not found." });
      return;
    }
    response.status(204).send();
  } catch {
    response.status(500).json({ error: "Unable to delete meal diary entry." });
  }
});

export default router;
