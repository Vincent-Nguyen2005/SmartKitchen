import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";
import { ConsumptionService } from "../services/consumption.service";

const querySchema = z.object({
  familyId: z.string().uuid(),
  days: z.coerce.number().int().min(7).max(365).default(90),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(250),
});

export class ConsumptionController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = querySchema.parse(req.query);
      await requireFamilyMembership(req as InventoryAuthRequest, query.familyId);
      const result = await ConsumptionService.getEvents(query.familyId, query.days, query.cursor, query.limit);
      res.json({ success: true, data: { ...result, windowDays: query.days } });
    } catch (error) {
      next(error);
    }
  }
}
