import { Request, Response, NextFunction } from "express";
import { ItemsService } from "../services/items.service";
import {
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
  itemScopeQuerySchema,
  catalogSearchQuerySchema,
  consumeItemSchema,
  matchItemQuerySchema,
  addQuantitySchema,
} from "../validators/items.validator";
import { resolveCatalogProduct } from "../services/catalog-match.service";
import { InventoryAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";
import { z } from "zod";
import { ProductCatalogService } from "../services/product-catalog.service";
import { barcodeParamSchema } from "../validators/purchase.validator";

export class ItemsController {
  static async searchCatalog(req: Request, res: Response, next: NextFunction) {
    try {
      const { q } = catalogSearchQuerySchema.parse(req.query);
      const result = await ProductCatalogService.searchProducts(q);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

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
      // The catalog product is decided here from the name (photo suggestion or typed), never by the client.
      const product = await resolveCatalogProduct((req as InventoryAuthRequest).authUser.userId, data.name);
      const item = await ItemsService.create(data, product?.id ?? null);
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
      const userId = (req as InventoryAuthRequest).authUser.userId;
      // A rename re-matches the catalog: a match sets productId, no match clears it (catalog down: unchanged).
      const product = data.name !== undefined ? await resolveCatalogProduct(userId, data.name) : undefined;
      const item = await ItemsService.update(id, familyId, data, userId, product);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /items/match?familyId&name&unit: before adding, the catalog product the name matches (id, name, image) and
   * the family's existing row of the same product and unit, if any ("Kho đã có ... Cộng thêm vào?").
   */
  static async match(req: Request, res: Response, next: NextFunction) {
    try {
      const query = matchItemQuerySchema.parse(req.query);
      const auth = req as InventoryAuthRequest;
      await requireFamilyMembership(auth, query.familyId);
      const product = await resolveCatalogProduct(auth.authUser.userId, query.name);
      const duplicate = await ItemsService.findDuplicate(query.familyId, { name: query.name, productId: product?.id ?? null, unit: query.unit });
      res.json({
        success: true,
        data: {
          product: product ? { id: product.id, name: product.name, imageUrl: product.imageUrl ?? null } : null,
          existing: duplicate.sameUnit,
          otherUnits: duplicate.otherUnits,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /items/:id/add?familyId: "Cộng thêm" chosen by the user; adds quantity to the existing row atomically. */
  static async addQuantity(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const { familyId } = itemScopeQuerySchema.parse(req.query);
      const input = addQuantitySchema.parse(req.body);
      const auth = req as InventoryAuthRequest;
      await requireFamilyMembership(auth, familyId);
      const item = await ItemsService.addQuantity(id, familyId, input, auth.authUser.userId);
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

  static async consume(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const { familyId } = itemScopeQuerySchema.parse(req.query);
      const { quantity } = consumeItemSchema.parse(req.body);
      const auth = req as InventoryAuthRequest;
      await requireFamilyMembership(auth, familyId);
      const item = await ItemsService.consume(id, familyId, quantity, auth.authUser.userId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }
}
