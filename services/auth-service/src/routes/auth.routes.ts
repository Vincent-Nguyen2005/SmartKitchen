import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { AuthService } from "../services/auth.service";
import { PrismaClient } from "@prisma/client";

export const createAuthRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  const controller = new AuthController(new AuthService(prisma));

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", controller.me);

  return router;
};

export default createAuthRouter;