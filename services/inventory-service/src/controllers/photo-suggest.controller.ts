import { NextFunction, Request, Response, Router } from "express";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireAnyFamily } from "../middleware/family-scope";
import { suggestFromPhoto, type SuggestResult } from "../services/photo-recognition/suggest.service";
import { readSingleImage } from "./photo.controller";

type Suggester = (input: { image: Buffer; mimeType: string; userId: string; familyId: string }) => Promise<SuggestResult>;
let suggester: Suggester = suggestFromPhoto;
/** Tests only: replace the recognition pipeline. */
export const setPhotoSuggester = (next: Suggester): void => { suggester = next; };

/**
 * POST /api/inventory/photo/suggest: one image (JPEG / PNG / WebP, max 5 MB) -> up to 3 catalog names.
 * The image is only analysed in memory, never stored. Signed-in family members only.
 */
export async function suggestPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req as InventoryAuthRequest;
    const familyId = await requireAnyFamily(auth);
    const file = await readSingleImage(req, res);
    const result = await suggester({ image: file.data, mimeType: file.mimeType, userId: auth.authUser.userId, familyId });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export const photoSuggestRouter = Router().post("/suggest", suggestPhoto);
