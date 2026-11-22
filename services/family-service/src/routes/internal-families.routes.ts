import { Router } from "express";
import { PrismaClient } from ".prisma/client-family";
import { z } from "zod";
import { requireInternalKey } from "./internal-key";
import { isDatabaseUnavailable } from "../database-error";
import { lookupProfiles, ProfileLookupError } from "../services/user-profiles";

const params = z.object({ id: z.string().uuid() });

/**
 * Service-to-service only (x-api-key = INTERNAL_API_KEY; the gateway blocks every path with an "internal" segment).
 * GET /internal/families/:id/members -> { items: [{ userId, name }] } in join order; name is the auth display name
 * (null when the user has none). Used by menu-service for family menus.
 */
export const createInternalFamiliesRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  router.use(requireInternalKey);

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
