import { Router } from "express";
import { ShoppingListController } from "../controllers/shopping-list.controller";

const router = Router();

router.post("/generate", ShoppingListController.generate);
router.get("/", ShoppingListController.list);

export default router;
