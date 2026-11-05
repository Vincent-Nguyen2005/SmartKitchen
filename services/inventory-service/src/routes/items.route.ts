import { Router } from "express";
import { ItemsController } from "../controllers/items.controller";

const router = Router();

router.get("/barcode/:barcode", ItemsController.lookupBarcode);
router.get("/catalog/search", ItemsController.searchCatalog);
router.post("/", ItemsController.create);
router.get("/", ItemsController.list);
router.get("/:id", ItemsController.getById);
router.post("/:id/consume", ItemsController.consume);
router.put("/:id", ItemsController.update);
router.delete("/:id", ItemsController.delete);

export default router;
