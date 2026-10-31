import { Request, Response, NextFunction } from "express";
import { ShoppingListService } from "../services/shopping-list.service";
import {
  familyQuerySchema,
  idParamSchema,
  updateItemBodySchema,
} from "../validators/shopping-list.validator";

export class ShoppingListController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = req.body;
      const result = await ShoppingListService.generateFromInventory(familyId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = familyQuerySchema.parse(req.query);
      const lists = await ShoppingListService.list(familyId);
      res.json({ success: true, lists });
    } catch (err) {
      next(err);
    }
  }

  static async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      const body = updateItemBodySchema.parse(req.body);
      const item = await ShoppingListService.updateItem(id, familyId, body);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      const list = await ShoppingListService.complete(id, familyId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
}
