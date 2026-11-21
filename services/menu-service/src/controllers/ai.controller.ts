import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "../../node_modules/.prisma/client-menu";
import { getKhoItems, MenuServiceError } from "../services/menu.service";
import { AiSuggestionEngine } from "../services/ai/ai-suggestions.service";
import type { AiDish } from "../services/ai/gemini";

const prisma = new PrismaClient();
export const aiEngine = new AiSuggestionEngine({ client: prisma });

const familyQuery = z.object({ familyId: z.string().uuid() });

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

/** The caller belongs to `familyId` (family-service /api/family/me with the caller's token). */
export async function requireFamilyMember(familyId: string, authorization: string | undefined, fetchImpl: typeof fetch = fetch): Promise<void> {
  const baseUrl = (process.env.FAMILY_SERVICE_URL ?? "http://localhost:4002").replace(/\/+$/, "");
  let response: globalThis.Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/family/me`, { headers: authorization ? { Authorization: authorization } : {}, signal: AbortSignal.timeout(5000) });
  } catch {
    throw new MenuServiceError("Không kiểm tra được gia đình. Hãy thử lại sau.", 503);
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) throw new MenuServiceError("Bạn không thuộc gia đình này.", 403);
  if (!response.ok) throw new MenuServiceError("Không kiểm tra được gia đình. Hãy thử lại sau.", 503);
  const body = await response.json().catch(() => null) as { data?: { family?: { id?: unknown } } } | null;
  if (body?.data?.family?.id !== familyId) throw new MenuServiceError("Bạn không thuộc gia đình này.", 403);
}

/**
 * GET /ai-suggestions?familyId: "Món gợi ý từ Kho". Reading Kho with the caller's token also checks family
 * membership (inventory-service answers 403 otherwise).
 */
export async function aiSuggestionsController(request: Request, response: ExpressResponse): Promise<void> {
  try {
    if (!authenticatedUserId(request, response)) return;
    const { familyId } = familyQuery.parse(request.query);
    const kho = await getKhoItems(familyId, request.header("authorization") ?? undefined);
    response.json(await aiEngine.getSuggestions(familyId, kho));
  } catch (error) {
    handleError(error, response);
  }
}

/** POST /ai-suggestions/:dishId/save { familyId }: keeps a suggested dish as a family-only recipe (source "ai"). */
export async function saveAiDishController(request: Request, response: ExpressResponse): Promise<void> {
  try {
    const userId = authenticatedUserId(request, response);
    if (!userId) return;
    const { familyId } = familyQuery.parse(request.body ?? {});
    await requireFamilyMember(familyId, request.header("authorization") ?? undefined);
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
    if (!authenticatedUserId(request, response)) return;
    const { familyId } = familyQuery.parse(request.query);
    await requireFamilyMember(familyId, request.header("authorization") ?? undefined);
    response.json(await prisma.savedRecipe.findMany({ where: { familyId }, orderBy: { createdAt: "desc" } }));
  } catch (error) {
    handleError(error, response);
  }
}
