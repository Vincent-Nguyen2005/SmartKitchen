import { MealType, PeriodType } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import {
  autoRefreshMenu,
  createManualMenu,
  deleteMenu,
  findMenu,
  generateMenu,
  listMenus,
  MenuServiceError,
} from "../services/menu.service";

const generateSchema = z.object({
  periodType: z.nativeEnum(PeriodType).default(PeriodType.WEEK),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  title: z.string().trim().min(1).max(120).optional(),
  preferences: z.record(z.unknown()).optional(),
  constraints: z.record(z.unknown()).optional(),
  recipes: z.array(z.unknown()).optional(),
});

const createMenuSchema = z.object({
  title: z.string().trim().min(1).max(120),
  periodType: z.nativeEnum(PeriodType).default(PeriodType.WEEK),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  items: z.array(z.object({
    recipeId: z.string().optional(),
    dishName: z.string().trim().min(1).max(160),
    mealType: z.nativeEnum(MealType).default(MealType.LUNCH),
    dayOfWeek: z.number().int().min(1).max(7),
    calories: z.number().min(0).optional(),
  })).default([]),
});

const refreshSchema = z.object({
  inventoryItems: z.array(z.unknown()).min(1),
  recipes: z.array(z.unknown()).optional(),
});

function authenticatedUserId(request: Request, response: Response): string | undefined {
  const userId = request.header("x-user-id")?.trim();
  if (!userId) response.status(401).json({ error: "Authentication required" });
  return userId || undefined;
}

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof MenuServiceError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  process.stderr.write(`Menu request failed: ${String(error)}\n`);
  response.status(500).json({ error: "Internal server error" });
}

export async function generateMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = generateSchema.parse(request.body);
    response.status(201).json(await generateMenu({ ...input, userId }));
  } catch (error) {
    console.error("Generate Menu Error:", error);
    handleError(error, response);
  }
}

export async function createMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = createMenuSchema.parse(request.body);
    response.status(201).json(await createManualMenu(userId, input));
  } catch (error) {
    handleError(error, response);
  }
}

export async function listMenusController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    response.json(await listMenus(userId));
  } catch (error) {
    handleError(error, response);
  }
}

export async function getMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const menu = await findMenu(userId, request.params.id);
    if (!menu) {
      response.status(404).json({ error: "Menu not found" });
      return;
    }
    response.json(menu);
  } catch (error) {
    handleError(error, response);
  }
}

export async function deleteMenuController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const deleted = await deleteMenu(userId, request.params.id);
    if (!deleted) {
      response.status(404).json({ error: "Menu not found" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    handleError(error, response);
  }
}

export async function autoRefreshController(request: Request, response: Response): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const input = refreshSchema.parse(request.body);
    response.json(await autoRefreshMenu(userId, input));
  } catch (error) {
    handleError(error, response);
  }
}