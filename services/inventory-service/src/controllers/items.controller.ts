import { Request, Response, NextFunction } from "express";
import { ItemsService } from "../services/items.service";
import {
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
  itemScopeQuerySchema,
} from "../validators/items.validator";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";
import { z } from "zod";
import { ProductCatalogService } from "../services/product-catalog.service";
import { barcodeParamSchema } from "../validators/purchase.validator";

export class ItemsController {
  static async lookupBarcode(req: Request, res: Response, next: NextFunction) {
    try {
      const { barcode } = barcodeParamSchema.parse(req.params);
      const result = await ProductCatalogService.lookupBarcode(barcode);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createItemSchema.parse(req.body);
      await requireFamilyMembership(req as InventoryAuthRequest, data.familyId);
      const item = await ItemsService.create(data);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listItemsQuerySchema.parse(req.query);
      await requireFamilyMembership(req as InventoryAuthRequest, query.familyId);
      const result = await ItemsService.list(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const { familyId } = itemScopeQuerySchema.parse(req.query);
      await requireFamilyMembership(req as InventoryAuthRequest, familyId);
      const item = await ItemsService.getById(id, familyId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = updateItemSchema.parse(req.body);
      const id = z.string().uuid().parse(req.params.id);
      const { familyId } = itemScopeQuerySchema.parse(req.query);
      await requireFamilyMembership(req as InventoryAuthRequest, familyId);
      const item = await ItemsService.update(id, familyId, data);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const { familyId } = itemScopeQuerySchema.parse(req.query);
      await requireFamilyMembership(req as InventoryAuthRequest, familyId);
      await ItemsService.softDelete(id, familyId);
      res.json({ success: true, message: "Item deleted" });
    } catch (err) {
      next(err);
    }
  }
}
