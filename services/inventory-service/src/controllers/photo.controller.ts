import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parseMultipartFiles } from "../lib/multipart";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  PhotoStorage,
  isPhotoFileName,
  photoFilePath,
  photoUrlFor,
  sniffImageType,
} from "../services/photo-storage.service";

const httpError = (statusCode: number, code: string, message: string) => Object.assign(new Error(message), { statusCode, code });

// Room for the multipart boundary and part headers around a maximum-size image.
const readMultipartBody = express.raw({ type: "multipart/form-data", limit: MAX_PHOTO_BYTES + 64 * 1024 });

const readBody = (req: Request, res: Response): Promise<void> => new Promise((resolve, reject) => {
  readMultipartBody(req, res, (error?: unknown) => {
    if (!error) return resolve();
    const status = (error as { status?: number }).status;
    reject(status === 413
      ? httpError(413, "PHOTO_TOO_LARGE", "The photo must be 5 MB or smaller.")
      : httpError(400, "INVALID_UPLOAD", "The upload body could not be read."));
  });
});

/** Loads a live item and checks that the signed-in user belongs to its family. */
const loadOwnedItem = async (req: Request) => {
  const id = z.string().uuid().parse(req.params.id);
  const item = await prisma.foodItem.findFirst({ where: { id, deletedAt: null }, select: { id: true, familyId: true, imageUrl: true } });
  if (!item) throw new Error("Item not found");
  await requireFamilyMembership(req as InventoryAuthRequest, item.familyId);
  return item;
};

export class PhotoController {
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await loadOwnedItem(req);
      if (!/^multipart\/form-data\b/i.test(req.header("content-type") ?? "")) {
        throw httpError(400, "INVALID_UPLOAD", "Send the photo as multipart/form-data.");
      }
      await readBody(req, res);
      const files = parseMultipartFiles(req.body as Buffer, req.header("content-type"));
      if (!files || files.length !== 1) throw httpError(400, "INVALID_UPLOAD", "Send exactly one image file.");
      const [file] = files;
      if (file.data.length === 0) throw httpError(400, "INVALID_UPLOAD", "The image file is empty.");
      if (file.data.length > MAX_PHOTO_BYTES) throw httpError(413, "PHOTO_TOO_LARGE", "The photo must be 5 MB or smaller.");
      const sniffed = sniffImageType(file.data);
      if (!ALLOWED_PHOTO_TYPES.includes(file.mimeType as never) || !sniffed) {
        throw httpError(400, "UNSUPPORTED_PHOTO_TYPE", "Only JPEG, PNG or WebP images are accepted.");
      }

      const saved = await PhotoStorage.save(item.id, file.data);
      const updated = await prisma.foodItem.updateMany({ where: { id: item.id, deletedAt: null }, data: { imageUrl: saved.url } });
      if (updated.count !== 1) {
        await PhotoStorage.removeByUrl(saved.url);
        throw new Error("Item not found");
      }
      if (item.imageUrl !== saved.url) await PhotoStorage.removeByUrl(item.imageUrl);
      res.status(201).json({ success: true, data: { id: item.id, imageUrl: saved.url } });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await loadOwnedItem(req);
      await prisma.foodItem.updateMany({ where: { id: item.id, deletedAt: null }, data: { imageUrl: null } });
      await PhotoStorage.removeByUrl(item.imageUrl);
      res.json({ success: true, data: { id: item.id, imageUrl: null } });
    } catch (err) {
      next(err);
    }
  }

  static async serve(req: Request, res: Response, next: NextFunction) {
    try {
      const fileName = String(req.params.file ?? "");
      if (!isPhotoFileName(fileName)) throw new Error("Item not found");
      const item = await loadOwnedItem(req);
      // The file must be the item's current photo; this binds the random name to one family's item.
      if (item.imageUrl !== photoUrlFor(item.id, fileName)) throw new Error("Item not found");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type("image/jpeg");
      res.sendFile(photoFilePath(fileName), { dotfiles: "deny" }, (error) => {
        if (error && !res.headersSent) next(new Error("Item not found"));
      });
    } catch (err) {
      next(err);
    }
  }
}
