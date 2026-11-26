import { Router } from "express";
import { PrismaClient } from ".prisma/client-family";
import { z } from "zod";
import { requireInternalKey } from "./internal-key";
import { isDatabaseUnavailable } from "../database-error";
import { lookupProfiles, ProfileLookupError } from "../services/user-profiles";
import { effectiveRole } from "../services/roles";

const params = z.object({ id: z.string().uuid() });
const membershipsBody = z.object({ userIds: z.array(z.string().uuid()).min(1).max(500) });

/**
 * Service-to-service only (x-api-key = INTERNAL_API_KEY; the gateway blocks every path with an "internal" segment).
 * GET /internal/families/:id/members -> { items: [{ userId, name }] } in join order; name is the auth display name
 * (null when the user has none). Used by menu-service for family menus.
 * POST /internal/families/memberships { userIds } (max 500) -> { items: [{ userId, familyId, role, memberCount }] }
 * for the users that belong to a family (others are left out). No names; menu-service resolves the caller's family
 * with it on each request and its startup backfill maps existing menus to families.
 */
export const createInternalFamiliesRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  router.use(requireInternalKey);

  router.post("/memberships", async (req, res) => {
    const parsed = membershipsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BODY", message: "userIds must be 1-500 UUIDs" });
      return;
    }
    try {
      const memberships = await prisma.familyMember.findMany({
        where: { userId: { in: [...new Set(parsed.data.userIds)] } },
        select: { userId: true, familyId: true, role: true, family: { select: { _count: { select: { members: true } } } } },
      });
      res.json({
        items: memberships.map(({ userId, familyId, role, family }) => ({ userId, familyId, role: effectiveRole(role), memberCount: family._count.members })),
      });
    } catch (error) {
      console.error("[family-service] internal membership lookup failed", error);
      const unavailable = isDatabaseUnavailable(error);
      res.status(unavailable ? 503 : 500).json({
        error: unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
        message: unavailable ? "Family database is unavailable" : "Unable to look up memberships",
      });
    }
  });

  router.get("/:id/members", async (req, res) => {
    const parsed = params.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_QUERY", message: "Family id must be a UUID" });
      return;
    }
    try {
      const family = await prisma.familyGroup.findUnique({
        where: { id: parsed.data.id },
        select: { members: { select: { userId: true }, orderBy: { joinedAt: "asc" } } },
      });
      if (!family) {
        res.status(404).json({ error: "FAMILY_NOT_FOUND", message: "Family not found" });
        return;
      }
      const profiles = await lookupProfiles(family.members.map((member) => member.userId));
      res.json({ items: family.members.map(({ userId }) => ({ userId, name: profiles.get(userId)?.name ?? null })) });
    } catch (error) {
      const upstream = error instanceof ProfileLookupError;
      if (!upstream) console.error("[family-service] internal member list failed", error);
      const unavailable = upstream || isDatabaseUnavailable(error);
      res.status(unavailable ? 503 : 500).json({
        error: unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
        message: upstream ? "Unable to load member names" : unavailable ? "Family database is unavailable" : "Unable to list members",
      });
    }
  });

  return router;
};
