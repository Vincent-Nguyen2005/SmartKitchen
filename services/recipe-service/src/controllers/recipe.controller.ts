import type { Request, Response } from "express";
import { z } from "zod";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  RecipeInUseError,
  RecipeNotFoundError,
  updateRecipe,
} from "../services/recipe.service";
import { RecipeUsageUnavailableError } from "../lib/menu-usage";

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof RecipeNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof RecipeInUseError) {
    response.status(409).json({ error: "IN_USE", code: "IN_USE", message: error.message, reasons: error.reasons });
    return;
  }
  if (error instanceof RecipeUsageUnavailableError) {
    console.error("[recipe-service] usage check failed:", error.message);
    response.status(503).json({ error: "USAGE_CHECK_UNAVAILABLE", message: "Không kiểm tra được món ăn đang được dùng ở đâu, chưa xóa. Thử lại sau." });
    return;
  }
  console.error("[recipe-service] request failed:", error);
  response.status(500).json({ error: "Internal server error" });
}

export async function listRecipesController(request: Request, response: Response): Promise<void> {
  try {
    const querySchema = z.object({
      search: z.string().trim().max(160).optional(),
      mealType: z.string().trim().min(1).max(40).optional(),
      /** active=true: only recipes that can be suggested (menu-service). */
      active: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
    });
    const query = querySchema.parse(request.query);
    response.json(await listRecipes(query));
  } catch (error) {
    handleError(error, response);
  }
}

export async function getRecipeController(request: Request<{ id: string }>, response: Response): Promise<void> {
  try {
    response.json(await getRecipe(request.params.id));
  } catch (error) {
    handleError(error, response);
  }
}

export async function createRecipeController(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json(await createRecipe(request.body));
  } catch (error) {
    handleError(error, response);
  }
}

export async function updateRecipeController(request: Request<{ id: string }>, response: Response): Promise<void> {
  try {
    response.json(await updateRecipe(request.params.id, request.body));
  } catch (error) {
    handleError(error, response);
  }
}

export async function deleteRecipeController(request: Request<{ id: string }>, response: Response): Promise<void> {
  try {
    await deleteRecipe(request.params.id);
    response.status(204).end();
  } catch (error) {
    handleError(error, response);
  }
}
