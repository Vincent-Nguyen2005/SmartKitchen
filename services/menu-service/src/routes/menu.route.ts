import { Router } from "express";
import {
  autoRefreshController,
  checkoutController,
  createMenuController,
  deleteMenuController,
  generateMenuController,
  getMenuController,
  khoHashController,
  getSettingsController,
  removeMenuItemController,
  generateDaysController,
  topUpMenuController,
  updateSettingsController,
  listMenusController,
} from "../controllers/menu.controller";
import { aiSuggestionsController, saveAiDishController, savedAiRecipesController } from "../controllers/ai.controller";

const router = Router();

// AI dishes from Kho (before "/:id" so these paths are not read as a menu id).
router.get("/ai-suggestions", aiSuggestionsController);
router.post("/ai-suggestions/:dishId/save", saveAiDishController);
router.get("/ai-recipes", savedAiRecipesController);
router.get("/kho-hash", khoHashController);
router.get("/settings", getSettingsController);
router.put("/settings", updateSettingsController);
router.post("/:id/items/:itemId/remove", removeMenuItemController);
router.post("/generate-days", generateDaysController);
router.post("/:id/top-up", topUpMenuController);
router.post("/generate", generateMenuController);
router.post("/auto-refresh", autoRefreshController);
router.post("/checkout", checkoutController);
router.post("/", createMenuController);
router.get("/", listMenusController);
router.get("/:id", getMenuController);
router.delete("/:id", deleteMenuController);

export default router;