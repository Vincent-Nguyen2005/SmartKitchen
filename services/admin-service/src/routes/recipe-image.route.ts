import express, { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { requireUser } from "../middleware/require-user";
import { parseMultipartFiles } from "../lib/multipart";
import {
  CatalogImageError, CatalogImageStorage, MAX_CATALOG_IMAGE_BYTES, catalogImagePath, isCatalogImageFileName, managedRecipeImage, recipeImageUrl, validateUpload,
} from "../lib/catalog-image";

/**
 * Dish images (Quản trị › Chụp ảnh / dish form). Stored by admin-service, which already re-encodes and stores catalog
 * images (sharp, the admin-uploads volume), so recipe-service needs no upload code or volume of its own:
 * - POST /recipes/:id/image (ADMIN): same rules as catalog images (JPEG / PNG / WebP ≤ 5 MB, magic bytes, re-encoded
 *   ≤ 1024 px JPEG, EXIF dropped); the file is recorded in RecipeImage and the recipe's imageUrl is set through
 *   recipe-service's admin update (PUT /api/recipes/:id, internal network); the replaced upload is removed; audited.
 * - GET /recipe-images/:file (any signed-in user, through the gateway): only a file a recipe currently uses.
 */
const router = Router();
const readMultipart = express.raw({ type: "multipart/form-data", limit: MAX_CATALOG_IMAGE_BYTES + 64 * 1024 });
const RECIPE_SERVICE_URL = () => (process.env.RECIPE_SERVICE_URL || "http://localhost:4006").replace(/\/+$/, "").replace(/^(?![a-z][a-z0-9+.-]*:\/\/)/i, "http://");

const readBody = (request: Request, response: Response): Promise<void> => new Promise((resolve, reject) => {
  readMultipart(request, response, (error?: unknown) => {
    if (!error) return resolve();
    reject((error as { status?: number }).status === 413
      ? new CatalogImageError(413, "PHOTO_TOO_LARGE", "The image must be 5 MB or smaller.")
      : new CatalogImageError(400, "INVALID_UPLOAD", "The upload body could not be read."));
  });
});

type RecipeRow = { id: string; name: string; imageUrl: string | null };
const recipeApi = {
  async get(id: string): Promise<RecipeRow | null> {
    const response = await fetch(`${RECIPE_SERVICE_URL()}/api/recipes/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new CatalogImageError(503, "RECIPES_UNAVAILABLE", "Recipe service is unavailable.");
    return (await response.json()) as RecipeRow;
  },
  async setImage(id: string, imageUrl: string, adminId: string): Promise<RecipeRow> {
    const response = await fetch(`${RECIPE_SERVICE_URL()}/api/recipes/${encodeURIComponent(id)}`, {
      method: "PUT",
      // Same identity headers the gateway forwards for an admin.
      headers: { "content-type": "application/json", "x-user-id": adminId, "x-user-role": "ADMIN" },
      body: JSON.stringify({ imageUrl }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new CatalogImageError(503, "RECIPES_UNAVAILABLE", "Recipe service could not save the image.");
    return (await response.json()) as RecipeRow;
  },
};
/** Tests replace the recipe-service calls. */
export const recipeService = recipeApi;

router.post("/recipes/:id/image", requireAdmin, async (request, response) => {
  try {
    if (!/^multipart\/form-data\b/i.test(request.header("content-type") ?? "")) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send the image as multipart/form-data.");
    const recipe = await recipeService.get(request.params.id);
    if (!recipe) return response.status(404).json({ error: "NOT_FOUND", message: "Recipe not found" });
    await readBody(request, response);
    const files = parseMultipartFiles(request.body as Buffer, request.header("content-type"));
    if (!files || files.length !== 1) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send exactly one image file.");
    const saved = await CatalogImageStorage.save(validateUpload(files[0]));
    const url = recipeImageUrl(saved.fileName);
    const previous = await prisma.recipeImage.findUnique({ where: { recipeId: recipe.id } });
    try {
      await prisma.$transaction(async (tx) => {
        if (previous) await tx.recipeImage.delete({ where: { fileName: previous.fileName } });
        await tx.recipeImage.create({ data: { fileName: saved.fileName, recipeId: recipe.id } });
        await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "SET_IMAGE", targetType: "Recipe", targetId: recipe.id, metadata: { before: { imageUrl: recipe.imageUrl }, after: { imageUrl: url } } } });
      });
      await recipeService.setImage(recipe.id, url, adminUserId(request));
    } catch (error) {
      // Undo: the new file goes, the previous record comes back.
      await prisma.recipeImage.deleteMany({ where: { fileName: saved.fileName } }).catch(() => undefined);
      if (previous) await prisma.recipeImage.create({ data: previous }).catch(() => undefined);
      await CatalogImageStorage.removeByUrl(`/api/admin/catalog/images/${saved.fileName}`);
      throw error;
    }
    if (previous) await CatalogImageStorage.removeByUrl(`/api/admin/catalog/images/${previous.fileName}`);
    return response.json({ recipe: { id: recipe.id, name: recipe.name, imageUrl: url }, replaced: Boolean(recipe.imageUrl) });
  } catch (error) {
    if (error instanceof CatalogImageError) return response.status(error.statusCode).json({ error: error.code, message: error.message });
    throw error;
  }
});

router.get("/recipe-images/:file", requireUser, async (request, response) => {
  const fileName = String(request.params.file ?? "");
  if (!isCatalogImageFileName(fileName) || !(await prisma.recipeImage.findUnique({ where: { fileName } }))) {
    return response.status(404).json({ error: "NOT_FOUND", message: "Image not found" });
  }
  response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.type("image/jpeg");
  return response.sendFile(catalogImagePath(fileName), { dotfiles: "deny" }, (error) => {
    if (error && !response.headersSent) response.status(404).json({ error: "NOT_FOUND", message: "Image not found" });
  });
});

export { managedRecipeImage };
export default router;
