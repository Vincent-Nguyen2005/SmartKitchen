import { Request, Response, NextFunction } from "express";
import { AlertsService } from "../services/alerts.service";
import { expiringQuerySchema } from "../validators/alerts.validator";

export class AlertsController {
  static async getExpiring(req: Request, res: Response, next: NextFunction) {
    try {
      const query = expiringQuerySchema.parse(req.query);
      const items = await AlertsService.getExpiringItems(query);
      res.json({
        success: true,
        count: items.length,
        thresholdDays: query.days,
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  static async refreshStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const query = expiringQuerySchema.parse(req.query);
      const count = await AlertsService.updateExpiringStatus(query);
      res.json({
        success: true,
        message: `Updated ${count} items to NEAR_EXPIRY`,
        updatedCount: count,
      });
    } catch (err) {
      next(err);
    }
  }
}
