import { Router } from "express";
import { CaptureController } from "../controllers/capture.controller";
import { requireInternalApiKey } from "../middleware/internal-api-key";

export const receiptRouter = Router();
receiptRouter.post("/ocr", CaptureController.recognizeReceipt);

export const internalInventoryRouter = Router();
internalInventoryRouter.post("/purchases", requireInternalApiKey, CaptureController.applyPurchase);
// Đi chợ delivery orders (shopping-list-service): "Đang giao" rows, delivered, cancelled / failed.
internalInventoryRouter.post("/deliveries/pending", requireInternalApiKey, CaptureController.createPendingDelivery);
internalInventoryRouter.post("/deliveries/:orderId/deliver", requireInternalApiKey, CaptureController.deliverOrder);
internalInventoryRouter.post("/deliveries/:orderId/cancel", requireInternalApiKey, CaptureController.cancelDelivery);
