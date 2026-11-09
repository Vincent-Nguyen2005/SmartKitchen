import type { Request, Response } from "express";
import { z } from "zod";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  RecipeNotFoundError,
  updateRecipe,
} from "../services/recipe.service";

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof RecipeNotFoundError) {
    response.status(404).json({ error: error.message });
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
