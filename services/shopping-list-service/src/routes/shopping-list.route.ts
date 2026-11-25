import { Router } from "express";
import { ShoppingListController } from "../controllers/shopping-list.controller";

const router = Router();

router.post("/generate", ShoppingListController.generate);
router.get("/", ShoppingListController.list);
router.get("/suggestions", ShoppingListController.suggestions);
router.post("/items", ShoppingListController.addItem);
router.post("/items/ensure", ShoppingListController.ensureItems);
router.post("/checkout", ShoppingListController.checkout);
router.post("/items/:id/purchase", ShoppingListController.confirmPurchase);
router.patch("/items/:id", ShoppingListController.updateItem);
router.delete("/items/:id", ShoppingListController.deleteItem);
router.patch("/:id/complete", ShoppingListController.complete);

export default router;
