import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { AuthService } from "../services/auth.service";
import { PrismaClient } from ".prisma/client-auth";

export const createAuthRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  const controller = new AuthController(new AuthService(prisma));

  router.post("/register", controller.register);
  router.post("/verify-otp", controller.verifyOtp);
  router.post("/resend-otp", controller.resendOtp);
  router.post("/password-reset/request", controller.requestPasswordReset);
  router.post("/password-reset/confirm", controller.confirmPasswordReset);
  router.post("/login", controller.login);
  router.post("/google", controller.google);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);
  router.get("/me", controller.me);

  return router;
};

export default createAuthRouter;
