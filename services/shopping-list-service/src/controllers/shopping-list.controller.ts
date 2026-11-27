import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ShoppingListService } from "../services/shopping-list.service";
import {
  addItemBodySchema,
  ensureItemsBodySchema,
  familyQuerySchema,
  generateBodySchema,
  idParamSchema,
  updateItemBodySchema, checkoutBodySchema, checkoutPreviewBodySchema, spendingQuerySchema, ordersQuerySchema, shipperOrdersQuerySchema, failOrderBodySchema } from "../validators/shopping-list.validator";
import { OrdersService } from "../services/orders.service";
import { PromotionsService, promotionInputSchema } from "../services/promotions.service";
import { monthSpending, recordPurchase, vnMonth } from "../services/spending.service";
import { catalogDetails } from "../services/shopping-list.service";
import { ShoppingAuthRequest } from "../middleware/auth.middleware";
import { requireFamilyMembership } from "../middleware/family-scope";

const auth = (req: Request): ShoppingAuthRequest => req as ShoppingAuthRequest;
const activeBodySchema = z.object({ isActive: z.boolean() });

export class ShoppingListController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = generateBodySchema.parse(req.body);
      await requireFamilyMembership(auth(req), familyId);
      const result = await ShoppingListService.generateFromMenu(familyId, req.header("authorization") || "");
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
      const suggestions = await ShoppingListService.getSuggestions(familyId, req.header("authorization") || "");
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

  static async ensureItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId, items } = ensureItemsBodySchema.parse(req.body);
      await requireFamilyMembership(auth(req), familyId);
      const result = await ShoppingListService.ensureItems(familyId, items);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** Catalog details (price, group, shelf life) of the active cart's products. */
  private static async cartCatalog(familyId: string, userId: string) {
    const lists = await ShoppingListService.list(familyId);
    const productIds = lists.flatMap((list) => (list.status === "ACTIVE" ? list.items : [])).flatMap((item) => (item.productId && !item.purchaseId && !item.inventoryAppliedAt ? [item.productId] : []));
    return catalogDetails(userId, productIds);
  }

  static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId, items, delivery, expectedTotal } = checkoutBodySchema.parse(req.body);
      const request = auth(req);
      await requireFamilyMembership(request, familyId);
      const catalog = await ShoppingListController.cartCatalog(familyId, request.authUser.userId);
      const order = await OrdersService.place(familyId, request.authUser.userId, delivery, items, catalog, { expectedTotal });
      res.status(201).json({ success: true, data: { order } });
    } catch (err) {
      next(err);
    }
  }

  /** POST /checkout/preview: the same totals "Đặt hàng" will charge (automatic promotion included). */
  static async checkoutPreview(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId, items } = checkoutPreviewBodySchema.parse(req.body);
      const request = auth(req);
      await requireFamilyMembership(request, familyId);
      const catalog = await ShoppingListController.cartCatalog(familyId, request.authUser.userId);
      res.json({ success: true, data: await OrdersService.preview(familyId, request.authUser.userId, items, catalog) });
    } catch (err) {
      next(err);
    }
  }

  // ---- Quản trị › Chương trình khuyến mãi (ADMIN role in the verified token) ----
  static async adminPromotions(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: { items: await PromotionsService.list() } }); } catch (err) { next(err); }
  }

  static async createPromotion(req: Request, res: Response, next: NextFunction) {
    try {
      const input = promotionInputSchema.parse(req.body);
      res.status(201).json({ success: true, data: await PromotionsService.create(auth(req).authUser.userId, input) });
    } catch (err) { next(err); }
  }

  static async updatePromotion(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const input = promotionInputSchema.parse(req.body);
      res.json({ success: true, data: await PromotionsService.update(auth(req).authUser.userId, id, input) });
    } catch (err) { next(err); }
  }

  static async setPromotionActive(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { isActive } = activeBodySchema.parse(req.body);
      res.json({ success: true, data: await PromotionsService.setActive(auth(req).authUser.userId, id, isActive) });
    } catch (err) { next(err); }
  }

  static async confirmPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      const request = auth(req);
      await requireFamilyMembership(request, familyId);
      const result = await ShoppingListService.confirmPurchase(id, familyId, request.authUser.userId);
      // "Chi tiêu": a single-item purchase is a purchase of one line (no-op when it was already recorded).
      if (!result.alreadyPurchased) {
        const productId = result.item.productId;
        await recordPurchase(familyId, request.authUser.userId, [id], productId ? await catalogDetails(request.authUser.userId, [productId]) : new Map())
          .catch((error: unknown) => console.error(JSON.stringify({ event: "purchase_record_failed", lines: 1, message: error instanceof Error ? error.message : "unknown" })));
      }
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** GET /orders?familyId: the family's delivery orders, newest first (members only). */
  static async orders(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ordersQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), query.familyId);
      res.json({ success: true, data: await OrdersService.list(query.familyId, query) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /orders/last-delivery?familyId: the caller's last delivery details (prefill), or null. */
  static async lastDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const { familyId } = familyQuerySchema.parse(req.query);
      const request = auth(req);
      await requireFamilyMembership(request, familyId);
      res.json({ success: true, data: { delivery: await OrdersService.lastDelivery(familyId, request.authUser.userId) } });
    } catch (err) {
      next(err);
    }
  }

  /** POST /orders/:id/cancel?familyId: "Hủy đơn" while PENDING (members of the order's family only). */
  static async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), familyId);
      res.json({ success: true, data: { order: await OrdersService.cancel(id, familyId) } });
    } catch (err) {
      next(err);
    }
  }

  /** Shipper: GET /shipper/orders?scope=available|mine. */
  static async shipperOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { scope, lat, lng } = shipperOrdersQuerySchema.parse(req.query);
      const origin = lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : null;
      res.json({ success: true, data: { items: await OrdersService.shipperList(auth(req).authUser.userId, scope, origin) } });
    } catch (err) {
      next(err);
    }
  }

  /** Shipper: GET /shipper/orders/:id (a waiting order or one of the caller's). */
  static async shipperOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { lat, lng } = shipperOrdersQuerySchema.parse(req.query);
      const origin = lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : null;
      res.json({ success: true, data: { order: await OrdersService.shipperDetail(id, auth(req).authUser.userId, origin) } });
    } catch (err) {
      next(err);
    }
  }

  static async acceptOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      res.json({ success: true, data: { order: await OrdersService.accept(id, auth(req).authUser.userId) } });
    } catch (err) {
      next(err);
    }
  }

  static async deliverOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      res.json({ success: true, data: { order: await OrdersService.deliver(id, auth(req).authUser.userId) } });
    } catch (err) {
      next(err);
    }
  }

  static async failOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { reason } = failOrderBodySchema.parse(req.body);
      res.json({ success: true, data: { order: await OrdersService.fail(id, auth(req).authUser.userId, reason) } });
    } catch (err) {
      next(err);
    }
  }

  /** GET /spending?familyId&month=YYYY-MM: month summary + purchases of the caller's family (members only, 403 otherwise). */
  static async spending(req: Request, res: Response, next: NextFunction) {
    try {
      const query = spendingQuerySchema.parse(req.query);
      const request = auth(req);
      await requireFamilyMembership(request, query.familyId);
      const data = await monthSpending(query.familyId, query.month ?? vnMonth(), {
        page: query.page, limit: query.limit,
        catalog: (productIds) => catalogDetails(request.authUser.userId, productIds),
      });
      res.json({ success: true, data });
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

  static async deleteItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { familyId } = familyQuerySchema.parse(req.query);
      await requireFamilyMembership(auth(req), familyId);
      await ShoppingListService.removeItem(id, familyId);
      res.status(204).send();
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
