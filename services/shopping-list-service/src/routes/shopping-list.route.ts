import { Router } from "express";
import { ShoppingListController } from "../controllers/shopping-list.controller";
import { requireShipper } from "../middleware/auth.middleware";

const router = Router();

router.post("/generate", ShoppingListController.generate);
router.get("/", ShoppingListController.list);
router.get("/suggestions", ShoppingListController.suggestions);
router.get("/spending", ShoppingListController.spending);
// Delivery orders (customer): list, last delivery details, cancel while PENDING.
router.get("/orders", ShoppingListController.orders);
router.get("/orders/last-delivery", ShoppingListController.lastDelivery);
router.post("/orders/:id/cancel", ShoppingListController.cancelOrder);
// Shipper API (SHIPPER role; no app screens yet).
router.get("/shipper/orders", requireShipper, ShoppingListController.shipperOrders);
router.post("/shipper/orders/:id/accept", requireShipper, ShoppingListController.acceptOrder);
router.post("/shipper/orders/:id/deliver", requireShipper, ShoppingListController.deliverOrder);
router.post("/shipper/orders/:id/fail", requireShipper, ShoppingListController.failOrder);
router.post("/items", ShoppingListController.addItem);
router.post("/items/ensure", ShoppingListController.ensureItems);
router.post("/checkout", ShoppingListController.checkout);
router.post("/items/:id/purchase", ShoppingListController.confirmPurchase);
router.patch("/items/:id", ShoppingListController.updateItem);
router.delete("/items/:id", ShoppingListController.deleteItem);
router.patch("/:id/complete", ShoppingListController.complete);

export default router;
