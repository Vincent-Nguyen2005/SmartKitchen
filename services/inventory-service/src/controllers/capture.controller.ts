import type { NextFunction, Request, Response } from "express";
import { DeliveriesService } from "../services/deliveries.service";
import { cancelDeliverySchema, deliverSchema, deliveryLinesSchema, orderIdParamSchema } from "../validators/delivery.validator";
import { applyPurchaseSchema, receiptOcrSchema } from "../validators/purchase.validator";
import { PurchasesService } from "../services/purchases.service";
import { ReceiptOcrService } from "../services/receipt-ocr.service";

const imageMatchesMime = (buffer: Buffer, mimeType: string): boolean => {
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
};

export class CaptureController {
  static async recognizeReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const input = receiptOcrSchema.parse(req.body);
      const base64 = input.imageBase64.replace(/^data:image\/(?:jpeg|png|webp);base64,/i, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
        res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "The receipt image could not be read." });
        return;
      }
      const image = Buffer.from(base64, "base64");
      if (image.length > 5 * 1024 * 1024 || !imageMatchesMime(image, input.mimeType)) {
        res.status(400).json({ success: false, error: "INVALID_IMAGE", message: "Upload a valid JPEG, PNG, or WebP image under 5 MB." });
        return;
      }
      const result = await ReceiptOcrService.recognize(image);
      res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof Error && "name" in error && (error.name === "Error" || error.name === "ErrorEvent")) {
        next(Object.assign(new Error("Receipt OCR is temporarily unavailable. You can still add items manually."), {
          statusCode: 503,
          code: "OCR_UNAVAILABLE",
        }));
        return;
      }
      next(error);
    }
  }

  /** Internal: Kho rows "Đang giao" for a new delivery order (idempotent per cart line). */
  static async createPendingDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await DeliveriesService.createPending(deliveryLinesSchema.parse(req.body)) });
    } catch (error) {
      next(error);
    }
  }

  /** Internal: the order was delivered; its lines become normal purchased rows (idempotent). */
  static async deliverOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      res.json({ success: true, data: await DeliveriesService.deliver(orderId, deliverSchema.parse(req.body)) });
    } catch (error) {
      next(error);
    }
  }

  /** Internal: the order was cancelled or failed; its "Đang giao" rows are removed (idempotent). */
  static async cancelDelivery(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = orderIdParamSchema.parse(req.params);
      const { familyId } = cancelDeliverySchema.parse(req.body);
      res.json({ success: true, data: await DeliveriesService.cancel(orderId, familyId) });
    } catch (error) {
      next(error);
    }
  }

  static async applyPurchase(req: Request, res: Response, next: NextFunction) {
    try {
      const input = applyPurchaseSchema.parse(req.body);
      const result = await PurchasesService.apply(input);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}
