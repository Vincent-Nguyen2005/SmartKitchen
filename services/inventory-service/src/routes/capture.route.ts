import { Router } from "express";
import { CaptureController } from "../controllers/capture.controller";
import { requireInternalApiKey } from "../middleware/internal-api-key";

export const receiptRouter = Router();
receiptRouter.post("/ocr", CaptureController.recognizeReceipt);

export const internalInventoryRouter = Router();
internalInventoryRouter.post("/purchases", requireInternalApiKey, CaptureController.applyPurchase);
