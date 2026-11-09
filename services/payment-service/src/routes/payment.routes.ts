import { Router } from "express";
import {
  createPayment,
  getPaymentStatus,
  handleMomoIpn,
  handlePaymentCallback,
} from "../controllers/payment.controller";
import { requirePaymentUser } from "../middleware/auth.middleware";

const router = Router();

router.post("/create", requirePaymentUser, createPayment);
router.get("/callback", handlePaymentCallback);
router.post("/callback/momo", handleMomoIpn);
router.get("/:id/status", requirePaymentUser, getPaymentStatus);

export default router;
