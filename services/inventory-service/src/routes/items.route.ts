import { Router } from "express";
import { ItemsController } from "../controllers/items.controller";

const router = Router();

router.post("/", ItemsController.create);
router.get("/", ItemsController.list);
router.get("/:id", ItemsController.getById);
router.put("/:id", ItemsController.update);
router.delete("/:id", ItemsController.delete);

export default router;
