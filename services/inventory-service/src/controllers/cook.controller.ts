import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";
import { CookService } from "../services/cook.service";
import { loadCatalogLabels, type CatalogLabel } from "../services/photo-recognition/catalog-labels";

/** POST /cook: the dish's ingredients (scaled by the app; seasonings and amounts like "vừa ăn" left out). */
export const cookSchema = z.object({
  familyId: z.string().uuid(),
  /** Client-made id of this "Đã ăn" tap; a retry with the same id changes nothing. */
  cookId: z.string().uuid(),
  dishName: z.string().trim().max(120).optional(),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    quantity: z.number().finite().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(20),
  })).max(60),
});

export type CatalogSource = (userId: string) => Promise<CatalogLabel[]>;
let catalogSource: CatalogSource = (userId) => loadCatalogLabels(userId);
/** Tests only. */
export const setCookCatalogSource = (next: CatalogSource): void => { catalogSource = next; };

export class CookController {
  static async cook(req: Request, res: Response, next: NextFunction) {
    try {
      const input = cookSchema.parse(req.body);
      const { userId } = (req as InventoryAuthRequest).authUser;
      await requireFamilyMembership(req as InventoryAuthRequest, input.familyId);
      // Without the catalog (admin-service down) only g/kg and ml/l convert; packs then match by unit only.
      const catalog = await catalogSource(userId).catch(() => [] as CatalogLabel[]);
      const result = await CookService.cook({ familyId: input.familyId, cookId: input.cookId, dishName: input.dishName, lines: input.ingredients }, catalog, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
