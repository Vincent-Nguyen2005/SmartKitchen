import { FamilyRole, PrismaClient } from ".prisma/client-family";
import { NextFunction, Request, Response } from "express";
import { AuthenticatedRequest } from "../controllers/family.controller";
import { isDatabaseUnavailable } from "../database-error";
import { effectiveRole } from "../services/roles";

/** A leftover family ADMIN counts as MEMBER (family roles are owner and member only). */
export const requireRole = (prisma: PrismaClient, allowedRoles: FamilyRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as AuthenticatedRequest).authUser?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    void prisma.familyMember.findFirst({
      where: { userId },
      select: { role: true },
    }).then((membership) => {
      if (!membership) {
        res.status(404).json({ success: false, error: "You do not belong to a family" });
        return;
      }
      if (!allowedRoles.includes(effectiveRole(membership.role))) {
        res.status(403).json({ success: false, error: "You do not have permission to perform this action" });
        return;
      }
      next();
    }).catch((error: unknown) => {
      console.error("[family-service] authorization check failed", error);
      if (isDatabaseUnavailable(error)) {
        res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Family database is unavailable" });
        return;
      }
      res.status(500).json({ success: false, error: "An unexpected error occurred" });
    });
  };
