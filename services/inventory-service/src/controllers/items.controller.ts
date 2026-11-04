import { Request, Response, NextFunction } from "express";
import { ItemsService } from "../services/items.service";
import {
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
} from "../validators/items.validator";

export class ItemsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createItemSchema.parse(req.body);
      const item = await ItemsService.create(data);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listItemsQuerySchema.parse(req.query);
      const result = await ItemsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ItemsService.getById(req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = updateItemSchema.parse(req.body);
      const item = await ItemsService.update(req.params.id, data);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ItemsService.softDelete(req.params.id);
      res.json({ success: true, message: "Item deleted" });
    } catch (err) {
      next(err);
    }
  }
}
