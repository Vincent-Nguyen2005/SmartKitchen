import { createHmac, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest, FamilyController } from "../controllers/family.controller";
import { FamilyService } from "../services/family.service";

type FamilyAuthClaims = { sub: string; email?: string; exp?: number; [key: string]: unknown };

const verifyToken = (token: string, secret: string): FamilyAuthClaims => {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { alg?: string };
  if (header.alg !== "HS256") throw new Error("Unsupported JWT algorithm");
  const expected = createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  const received = Buffer.from(encodedSignature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid JWT signature");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as FamilyAuthClaims;
  if (typeof payload.sub !== "string" || (payload.exp !== undefined && payload.exp <= Math.floor(Date.now() / 1000))) {
    throw new Error("Expired or invalid JWT");
  }
  return payload;
};

const requireAuthentication = (req: Request, res: Response, next: NextFunction): void => {
  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const claims = verifyToken(token, process.env.JWT_SECRET || "development-only-secret");
    (req as AuthenticatedRequest).authUser = { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
};

export const createFamilyRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  const controller = new FamilyController(new FamilyService(prisma));
  router.use(requireAuthentication);
  router.post("/", (req, res, next) => { void controller.create(req as AuthenticatedRequest, res).catch(next); });
  router.get("/me", (req, res, next) => { void controller.me(req as AuthenticatedRequest, res).catch(next); });
  router.delete("/me", (req, res, next) => { void controller.leave(req as AuthenticatedRequest, res).catch(next); });
  router.post("/invite", (req, res, next) => { void controller.invite(req as AuthenticatedRequest, res).catch(next); });
  router.post("/join", (req, res, next) => { void controller.join(req as AuthenticatedRequest, res).catch(next); });
  router.patch("/members/:memberId/role", (req, res, next) => { void controller.updateRole(req as unknown as AuthenticatedRequest, res).catch(next); });
  router.delete("/members/:memberId", (req, res, next) => { void controller.removeMember(req as unknown as AuthenticatedRequest, res).catch(next); });
  return router;
};

export default createFamilyRouter;