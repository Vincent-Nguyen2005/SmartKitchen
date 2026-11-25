import { createHmac, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { PrismaClient } from ".prisma/client-family";
import { AuthenticatedRequest, FamilyController } from "../controllers/family.controller";
import { FamilyRole } from ".prisma/client-family";
import { requireRole } from "../middleware/authorization.middleware";
import { FamilyService } from "../services/family.service";
import { FamilyQrService } from "../services/family-qr.service";
import { createRateLimit } from "../middleware/rate-limit";

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

/** `now`: clock for the QR token expiry (tests). */
export const createFamilyRouter = (prisma: PrismaClient, now: () => Date = () => new Date()): Router => {
  const router = Router();
  const controller = new FamilyController(new FamilyService(prisma), new FamilyQrService(prisma, now));
  // QR verify / join: at most 10 tries per user per 5 minutes (a token is 32 random characters; this stops guessing).
  const qrLimit = createRateLimit({ limit: 10, windowMs: 5 * 60 * 1000 });
  const managers = requireRole(prisma, [FamilyRole.OWNER, FamilyRole.ADMIN]);
  const owner = requireRole(prisma, [FamilyRole.OWNER]);
  router.post("/", requireAuthentication, (req, res, next) => { void controller.create(req as AuthenticatedRequest, res).catch(next); });
  router.get("/me", requireAuthentication, (req, res, next) => { void controller.me(req as AuthenticatedRequest, res).catch(next); });
  router.delete("/me", requireAuthentication, (req, res, next) => { void controller.leave(req as AuthenticatedRequest, res).catch(next); });
  router.post("/invite", requireAuthentication, managers, (req, res, next) => { void controller.invite(req as AuthenticatedRequest, res).catch(next); });
  router.get("/invitations/verify", requireAuthentication, (req, res, next) => { void controller.verifyInvitation(req as AuthenticatedRequest, res).catch(next); });
  router.post("/join-code/regenerate", requireAuthentication, managers, (req, res, next) => { void controller.regenerateJoinCode(req as AuthenticatedRequest, res).catch(next); });
  router.post("/qr", requireAuthentication, (req, res, next) => { void controller.createQr(req as AuthenticatedRequest, res).catch(next); });
  router.post("/qr/revoke", requireAuthentication, (req, res, next) => { void controller.revokeQr(req as AuthenticatedRequest, res).catch(next); });
  router.post("/qr/verify", requireAuthentication, qrLimit, (req, res, next) => { void controller.verifyQr(req as AuthenticatedRequest, res).catch(next); });
  router.post("/qr/join", requireAuthentication, qrLimit, (req, res, next) => { void controller.joinQr(req as AuthenticatedRequest, res).catch(next); });
  router.post("/join", requireAuthentication, (req, res, next) => { void controller.join(req as AuthenticatedRequest, res).catch(next); });
  router.post("/transfer-ownership", requireAuthentication, owner, (req, res, next) => { void controller.transferOwnership(req as AuthenticatedRequest, res).catch(next); });
  router.get("/settings", requireAuthentication, (req, res, next) => { void controller.getSettings(req as AuthenticatedRequest, res).catch(next); });
  router.patch("/settings", requireAuthentication, managers, (req, res, next) => { void controller.updateSettings(req as AuthenticatedRequest, res).catch(next); });
  router.patch("/members/:memberId/role", requireAuthentication, managers, (req, res, next) => { void controller.updateRole(req as AuthenticatedRequest, res).catch(next); });
  router.delete("/members/:memberId", requireAuthentication, managers, (req, res, next) => { void controller.removeMember(req as AuthenticatedRequest, res).catch(next); });
  return router;
};

export default createFamilyRouter;
