import express, { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { parseMultipartFiles } from "../lib/multipart";
import { CatalogImageError, MAX_CATALOG_IMAGE_BYTES, reencodeImage, validateUpload } from "../lib/catalog-image";
import {
  createDailyLimit, createGeminiCaller, geminiConfig, INGREDIENT_SCHEMA, ingredientPrompt, RECIPE_SCHEMA, recipePrompt,
  validateIngredientSuggestion, validateRecipeSuggestion, type GeminiCaller,
} from "../lib/ai-suggest";

/**
 * POST /ai/suggest?kind=ingredient|recipe (ADMIN): one photo (multipart, field "photo", JPEG / PNG / WebP ≤ 5 MB) →
 * validated suggestions for the create form, with confidence and notes. The photo is re-encoded in memory (≤ 1024 px,
 * EXIF dropped), sent to Gemini and never stored. At most AI_SUGGEST_DAILY_LIMIT (30) calls per admin and Vietnam day.
 * 503 AI_OFF when Gemini is not configured, 502 AI_FAILED when it does not answer: the app then opens the empty form.
 */
const router = Router();
const readMultipart = express.raw({ type: "multipart/form-data", limit: MAX_CATALOG_IMAGE_BYTES + 64 * 1024 });
export const AI_DAILY_LIMIT = Number(process.env.AI_SUGGEST_DAILY_LIMIT) || 30;
let limit = createDailyLimit(AI_DAILY_LIMIT);
let callerOverride: GeminiCaller | null = null;
/** Tests: a fake Gemini and a fresh limit. */
export const setAiTestHooks = (hooks: { caller?: GeminiCaller | null; limit?: number }): void => {
  if (hooks.caller !== undefined) callerOverride = hooks.caller;
  if (hooks.limit !== undefined) limit = createDailyLimit(hooks.limit);
};

const readBody = (request: Request, response: Response): Promise<void> => new Promise((resolve, reject) => {
  readMultipart(request, response, (error?: unknown) => {
    if (!error) return resolve();
    reject((error as { status?: number }).status === 413
      ? new CatalogImageError(413, "PHOTO_TOO_LARGE", "The image must be 5 MB or smaller.")
      : new CatalogImageError(400, "INVALID_UPLOAD", "The upload body could not be read."));
  });
});

router.post("/ai/suggest", requireAdmin, async (request, response) => {
  const kind = request.query.kind === "recipe" ? "recipe" : request.query.kind === "ingredient" ? "ingredient" : null;
  if (!kind) return response.status(400).json({ error: "VALIDATION_ERROR", message: "kind must be ingredient or recipe" });
  const config = geminiConfig();
  const caller = callerOverride ?? (config ? createGeminiCaller(config) : null);
  if (!caller) return response.status(503).json({ error: "AI_OFF", message: "Nhận diện ảnh đang tắt." });
  try {
    if (!/^multipart\/form-data\b/i.test(request.header("content-type") ?? "")) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send the photo as multipart/form-data.");
    await readBody(request, response);
    const files = parseMultipartFiles(request.body as Buffer, request.header("content-type"));
    if (!files || files.length !== 1) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send exactly one image file.");
    const image = await reencodeImage(validateUpload(files[0]));
    // Counted only for a valid photo (a bad upload does not use the day's quota).
    if (!limit.take(adminUserId(request))) return response.status(429).json({ error: "AI_LIMIT", message: `Đã dùng hết ${AI_DAILY_LIMIT} lượt nhận diện hôm nay.` });
    if (kind === "ingredient") {
      const groups = (await prisma.masterIngredient.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } })).map((row) => row.category);
      const raw = await caller(image, "image/jpeg", ingredientPrompt(groups), INGREDIENT_SCHEMA).catch(() => undefined);
      if (raw === undefined) return response.status(502).json({ error: "AI_FAILED", message: "Không nhận diện được ảnh." });
      return response.json({ kind, suggestion: validateIngredientSuggestion(raw, groups) });
    }
    const catalog = await prisma.masterIngredient.findMany({ select: { name: true, englishName: true } });
    const raw = await caller(image, "image/jpeg", recipePrompt(), RECIPE_SCHEMA).catch(() => undefined);
    if (raw === undefined) return response.status(502).json({ error: "AI_FAILED", message: "Không nhận diện được ảnh." });
    return response.json({ kind, suggestion: validateRecipeSuggestion(raw, catalog) });
  } catch (error) {
    if (error instanceof CatalogImageError) return response.status(error.statusCode).json({ error: error.code, message: error.message });
    throw error;
  }
});

export default router;
