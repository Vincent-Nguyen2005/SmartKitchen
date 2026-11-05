import { Router } from "express";
import { ConsumptionController } from "../controllers/consumption.controller";

const router = Router();
router.get("/", ConsumptionController.list);

export default router;
