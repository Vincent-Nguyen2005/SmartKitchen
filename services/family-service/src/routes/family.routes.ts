import { createHmac, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { PrismaClient } from ".prisma/client-family";
import { AuthenticatedRequest, FamilyController } from "../controllers/family.controller";
import { FamilyRole } from ".prisma/client-family";
import { requireRole } from "../middleware/authorization.middleware";
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
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }
  try {
    const secret = process.env.JWT_SECRET || "development-only-secret";
    const claims = verifyToken(token, secret);
    (req as AuthenticatedRequest).authUser = { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired access token" });
  }
};

export const createFamilyRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  const controller = new FamilyController(new FamilyService(prisma));
  const managers = requireRole(prisma, [FamilyRole.OWNER, FamilyRole.ADMIN]);
  const owner = requireRole(prisma, [FamilyRole.OWNER]);
  router.use(requireAuthentication);
  router.post("/", (req, res, next) => { void controller.create(req as AuthenticatedRequest, res).catch(next); });
  router.get("/me", (req, res, next) => { void controller.me(req as AuthenticatedRequest, res).catch(next); });
  router.delete("/me", (req, res, next) => { void controller.leave(req as AuthenticatedRequest, res).catch(next); });
  router.post("/invite", managers, (req, res, next) => { void controller.invite(req as AuthenticatedRequest, res).catch(next); });
  router.get("/invitations/verify", (req, res, next) => { void controller.verifyInvitation(req as AuthenticatedRequest, res).catch(next); });
  router.post("/join-code/regenerate", managers, (req, res, next) => { void controller.regenerateJoinCode(req as AuthenticatedRequest, res).catch(next); });
  router.post("/join", (req, res, next) => { void controller.join(req as AuthenticatedRequest, res).catch(next); });
  router.post("/transfer-ownership", owner, (req, res, next) => { void controller.transferOwnership(req as AuthenticatedRequest, res).catch(next); });
  router.get("/settings", (req, res, next) => { void controller.getSettings(req as AuthenticatedRequest, res).catch(next); });
  router.patch("/settings", managers, (req, res, next) => { void controller.updateSettings(req as AuthenticatedRequest, res).catch(next); });
  router.patch("/members/:memberId/role", managers, (req, res, next) => { void controller.updateRole(req as AuthenticatedRequest, res).catch(next); });
  router.delete("/members/:memberId", managers, (req, res, next) => { void controller.removeMember(req as AuthenticatedRequest, res).catch(next); });
  return router;
};

export default createFamilyRouter;