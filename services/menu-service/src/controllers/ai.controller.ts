import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "../../node_modules/.prisma/client-menu";
import { getKhoItems, MenuServiceError } from "../services/menu.service";
import { AiSuggestionEngine } from "../services/ai/ai-suggestions.service";
import { loadFamilyContext } from "../services/family-context";
import { resolveMenuOwner } from "../services/menu-owner";
import type { AiDish } from "../services/ai/gemini";

const prisma = new PrismaClient();
export const aiEngine = new AiSuggestionEngine({ client: prisma });

/** familyId is optional: the caller's family is resolved from the signed-in user (a different id is refused). */
const familyQuery = z.object({ familyId: z.string().uuid().optional() });

/** The caller's family id (403 without a family or for another family's id). */
async function callerFamily(userId: string, requestedFamilyId?: string): Promise<{ familyId: string; owner: Awaited<ReturnType<typeof resolveMenuOwner>> }> {
  const owner = await resolveMenuOwner(userId, requestedFamilyId);
  if (!owner.familyId) throw new MenuServiceError("Bạn chưa thuộc gia đình nào.", 403);
  return { familyId: owner.familyId, owner };
}

function authenticatedUserId(request: Request, response: ExpressResponse): string | undefined {
  const userId = request.header("x-user-id")?.trim();
  if (!userId) response.status(401).json({ error: "Authentication required" });
  return userId || undefined;
}

function handleError(error: unknown, response: ExpressResponse): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.issues });
    return;
  }
  if (error instanceof MenuServiceError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error("[menu-service] AI request failed:", error instanceof Error ? error.message : "unknown error");
  response.status(500).json({ error: "Internal server error" });
}

/**
 * GET /ai-suggestions: "Món gợi ý từ Kho" for the caller's family, made for the family (anonymous aggregates sent to
 * the model; allergens dropped and warnings attached). Degraded family data uses the last known context.
 */
export async function aiSuggestionsController(request: Request, response: ExpressResponse): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { familyId, owner } = await callerFamily(userId, familyQuery.parse(request.query).familyId);
    const [kho, health] = await Promise.all([getKhoItems(familyId, request.header("authorization") ?? undefined), loadFamilyContext(owner)]);
    response.json(await aiEngine.getSuggestions(familyId, kho, health));
  } catch (error) {
    handleError(error, response);
  }
}

/** POST /ai-suggestions/:dishId/save { familyId }: keeps a suggested dish as a family-only recipe (source "ai"). */
export async function saveAiDishController(request: Request, response: ExpressResponse): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { familyId } = await callerFamily(userId, familyQuery.parse(request.body ?? {}).familyId);
    const row = await prisma.aiSuggestion.findUnique({ where: { familyId } });
    const dishes = Array.isArray(row?.dishes) ? row.dishes as unknown as AiDish[] : [];
    const dish = dishes.find((entry) => entry.id === request.params.dishId);
    if (!dish) {
      response.status(404).json({ error: "Món gợi ý này không còn nữa. Hãy tải lại gợi ý." });
      return;
    }
    const saved = await prisma.savedRecipe.upsert({
      where: { familyId_name: { familyId, name: dish.name } },
      create: { familyId, name: dish.name, source: "ai", dish: dish as unknown as Prisma.InputJsonValue, createdBy: userId },
      update: { dish: dish as unknown as Prisma.InputJsonValue },
    });
    response.status(201).json(saved);
  } catch (error) {
    handleError(error, response);
  }
}

/** GET /ai-recipes?familyId: the family's saved AI dishes, newest first. */
export async function savedAiRecipesController(request: Request, response: ExpressResponse): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { familyId } = await callerFamily(userId, familyQuery.parse(request.query).familyId);
    response.json(await prisma.savedRecipe.findMany({ where: { familyId }, orderBy: { createdAt: "desc" } }));
  } catch (error) {
    handleError(error, response);
  }
}
