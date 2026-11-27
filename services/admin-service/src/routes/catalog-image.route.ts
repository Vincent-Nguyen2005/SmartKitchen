import express, { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { adminUserId, requireAdmin } from "../middleware/require-admin";
import { requireUser } from "../middleware/require-user";
import { parseMultipartFiles } from "../lib/multipart";
import { promotionSync } from "../lib/promotion-sync";
import {
  ADMIN_UPLOAD_CREDIT, CatalogImageError, CatalogImageStorage, MAX_CATALOG_IMAGE_BYTES, catalogImagePath, catalogImageUrl, isCatalogImageFileName, validateUpload,
} from "../lib/catalog-image";

/**
 * Quản trị › "Chụp ảnh": an admin sets a catalog ingredient's image from a photo.
 * - POST /ingredients/:id/image (ADMIN): one JPEG / PNG / WebP file (≤ 5 MB) as multipart/form-data, field "photo";
 *   re-encoded (EXIF dropped, ≤ 1024 px JPEG), stored, set as the product image with the credit
 *   "Ảnh do quản trị viên tải lên"; the previous uploaded file is removed; audit-logged (SET_IMAGE).
 * - GET /catalog/images/:file (any signed-in user, through the gateway): the image, only while a product uses it.
 * Mounted before the admin router (whose requireAdmin would answer users first).
 */
const router = Router();
const readMultipart = express.raw({ type: "multipart/form-data", limit: MAX_CATALOG_IMAGE_BYTES + 64 * 1024 });

const readBody = (request: Request, response: Response): Promise<void> => new Promise((resolve, reject) => {
  readMultipart(request, response, (error?: unknown) => {
    if (!error) return resolve();
    reject((error as { status?: number }).status === 413
      ? new CatalogImageError(413, "PHOTO_TOO_LARGE", "The image must be 5 MB or smaller.")
      : new CatalogImageError(400, "INVALID_UPLOAD", "The upload body could not be read."));
  });
});

router.post("/ingredients/:id/image", requireAdmin, async (request, response) => {
  try {
    if (!/^multipart\/form-data\b/i.test(request.header("content-type") ?? "")) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send the image as multipart/form-data.");
    const before = await prisma.masterIngredient.findUnique({ where: { id: request.params.id } });
    if (!before) return response.status(404).json({ error: "NOT_FOUND", message: "Ingredient not found" });
    await readBody(request, response);
    const files = parseMultipartFiles(request.body as Buffer, request.header("content-type"));
    if (!files || files.length !== 1) throw new CatalogImageError(400, "INVALID_UPLOAD", "Send exactly one image file.");
    const data = validateUpload(files[0]);
    const saved = await CatalogImageStorage.save(data);
    let after;
    try {
      after = await prisma.$transaction(async (tx) => {
        const updated = await tx.masterIngredient.update({
          where: { id: before.id },
          data: { imageUrl: saved.url, imageSource: null, imageAuthor: ADMIN_UPLOAD_CREDIT, imageLicense: null },
        });
        await tx.auditLog.create({ data: { adminUserId: adminUserId(request), action: "SET_IMAGE", targetType: "MasterIngredient", targetId: updated.id, metadata: { before: { imageUrl: before.imageUrl }, after: { imageUrl: updated.imageUrl } } } });
        return updated;
      });
    } catch (error) {
      await CatalogImageStorage.removeByUrl(saved.url);
      throw error;
    }
    if (before.imageUrl !== after.imageUrl) await CatalogImageStorage.removeByUrl(before.imageUrl);
    // A discounted product's Thông báo promotion carries the image only for https links (not gateway paths).
    const promotion = after.discountPercent !== null ? await promotionSync.sync(after, true) : "none";
    return response.json({ ingredient: after, replaced: before.imageUrl !== null, promotionSync: promotion });
  } catch (error) {
    if (error instanceof CatalogImageError) return response.status(error.statusCode).json({ error: error.code, message: error.message });
    throw error;
  }
});

router.get("/catalog/images/:file", requireUser, async (request, response) => {
  const fileName = String(request.params.file ?? "");
  if (!isCatalogImageFileName(fileName)) return response.status(404).json({ error: "NOT_FOUND", message: "Image not found" });
  // Only files a product currently uses (a replaced image is gone even if someone kept its link).
  const inUse = await prisma.masterIngredient.count({ where: { imageUrl: catalogImageUrl(fileName) } });
  if (inUse === 0) return response.status(404).json({ error: "NOT_FOUND", message: "Image not found" });
  response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.type("image/jpeg");
  return response.sendFile(catalogImagePath(fileName), { dotfiles: "deny" }, (error) => {
    if (error && !response.headersSent) response.status(404).json({ error: "NOT_FOUND", message: "Image not found" });
  });
});

export default router;
