import { Router } from "express";
import { AlertsController } from "../controllers/alerts.controller";

const router = Router();

router.get("/expiring", AlertsController.getExpiring);
router.post("/refresh", AlertsController.refreshStatus);

export default router;
