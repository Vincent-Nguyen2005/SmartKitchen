import { Router } from "express";
import { AvatarController } from "../controllers/avatar.controller";

const router = Router();
router.post("/", AvatarController.upload);
router.delete("/", AvatarController.remove);
router.get("/:userId/:file", AvatarController.serve);

export default router;
