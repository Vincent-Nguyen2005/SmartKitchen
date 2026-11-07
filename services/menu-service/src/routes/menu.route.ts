import { Router } from "express";
import {
  autoRefreshController,
  createMenuController,
  deleteMenuController,
  generateMenuController,
  getMenuController,
  listMenusController,
} from "../controllers/menu.controller";

const router = Router();

router.post("/generate", generateMenuController);
router.post("/auto-refresh", autoRefreshController);
router.post("/", createMenuController);
router.get("/", listMenusController);
router.get("/:id", getMenuController);
router.delete("/:id", deleteMenuController);

export default router;