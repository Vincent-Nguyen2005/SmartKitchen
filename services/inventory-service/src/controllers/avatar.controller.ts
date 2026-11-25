import { existsSync } from "node:fs";
import { NextFunction, Request, Response } from "express";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { readSingleImage } from "./photo.controller";
import { AvatarStorage, avatarFilePath, isAvatarFileName } from "../services/avatar-storage.service";

const notFound = () => Object.assign(new Error("Avatar not found"), { statusCode: 404, code: "AVATAR_NOT_FOUND" });
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hồ sơ avatar photos (same upload rules and storage as Kho photos): upload / remove your own; any signed-in user
 * can view one by its URL (random 128-bit file names, shown to family members in Gia đình).
 */
export class AvatarController {
  /** POST /avatars: one JPEG / PNG / WebP image (max 5 MB, real type from magic bytes) for the signed-in user. */
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as InventoryAuthRequest).authUser;
      const file = await readSingleImage(req, res);
      const avatarUrl = await AvatarStorage.save(userId, file.data);
      res.status(201).json({ success: true, data: { avatarUrl } });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /avatars: removes the signed-in user's avatar files. */
  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await AvatarStorage.removeAll((req as InventoryAuthRequest).authUser.userId);
      res.json({ success: true, data: { avatarUrl: null } });
    } catch (err) {
      next(err);
    }
  }

  /** GET /avatars/:userId/:file */
  static async serve(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = String(req.params.userId ?? "");
      const fileName = String(req.params.file ?? "");
      if (!USER_ID.test(userId) || !isAvatarFileName(fileName)) throw notFound();
      const filePath = avatarFilePath(userId, fileName);
      if (!existsSync(filePath)) throw notFound();
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type("image/jpeg");
      res.sendFile(filePath, { dotfiles: "deny" }, (error) => {
        if (error && !res.headersSent) next(notFound());
      });
    } catch (err) {
      next(err);
    }
  }
}
