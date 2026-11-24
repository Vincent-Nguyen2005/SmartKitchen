import { Router } from "express";
import { ItemsController } from "../controllers/items.controller";
import { PhotoController } from "../controllers/photo.controller";

const router = Router();

router.get("/barcode/:barcode", ItemsController.lookupBarcode);
router.get("/catalog/search", ItemsController.searchCatalog);
router.get("/match", ItemsController.match);
router.post("/", ItemsController.create);
router.get("/", ItemsController.list);
router.get("/:id", ItemsController.getById);
router.post("/:id/consume", ItemsController.consume);
router.post("/:id/add", ItemsController.addQuantity);
router.post("/:id/photo", PhotoController.upload);
router.delete("/:id/photo", PhotoController.remove);
router.get("/:id/photo/:file", PhotoController.serve);
router.put("/:id", ItemsController.update);
router.delete("/:id", ItemsController.delete);

export default router;
