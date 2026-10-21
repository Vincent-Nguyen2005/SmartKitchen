import { Request, Response, NextFunction } from 'express';
import { ShoppingListService } from '../services/shopping-list.service';

export class ShoppingListController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = req.body;
      const result = await ShoppingListService.generateFromInventory(familyId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const familyId = req.query.familyId as string;
      const lists = await ShoppingListService.list(familyId);
      res.json({ success: true, lists });
    } catch (err) { next(err); }
  }
}
