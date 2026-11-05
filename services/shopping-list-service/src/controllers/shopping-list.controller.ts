import { Request, Response, NextFunction } from "express";
import { ShoppingListService } from "../services/shopping-list.service";
import {
  addItemBodySchema,
  familyQuerySchema,
  generateBodySchema,
  idParamSchema,
  updateItemBodySchema,
} from "../validators/shopping-list.validator";
import { ShoppingAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";

const auth = (req: Request): ShoppingAuthRequest => req as ShoppingAuthRequest;

export class ShoppingListController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = generateBodySchema.parse(req.body);
      await requireFamilyMembership(auth(req), familyId);
      const result = await ShoppingListService.generateFromInventory(familyId, req.header("authorization") || "");
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = familyQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), familyId);
      const lists = await ShoppingListService.list(familyId);
      res.json({ success: true, lists });
    } catch (err) {
      next(err);
    }
  }

  static async suggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = familyQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), familyId);
      const suggestions = await ShoppingListService.getSuggestions(familyId);
      res.json({ success: true, data: suggestions });
    } catch (err) {
      next(err);
    }
  }

  static async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const input = addItemBodySchema.parse(req.body);
      await requireFamilyMembership(auth(req), input.familyId);
      const item = await ShoppingListService.addItem(input);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async confirmPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      const request = auth(req);
      await requireFamilyMembership(request, familyId);
      const result = await ShoppingListService.confirmPurchase(id, familyId, request.authUser.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), familyId);
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
      await requireFamilyMembership(auth(req), familyId);
      const list = await ShoppingListService.complete(id, familyId);
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }
}
