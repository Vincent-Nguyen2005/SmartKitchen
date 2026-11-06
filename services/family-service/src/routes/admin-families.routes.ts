import { Router, type Request, type Response } from "express";
import { PrismaClient } from ".prisma/client-family";
import { z } from "zod";
import { requireInternalKey } from "./internal-key";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});
const detailParams = z.object({ id: z.string().uuid() });
const profileResult = z.object({
  items: z.array(z.object({ id: z.string(), email: z.string(), name: z.string().nullable() })),
});
type Profile = z.infer<typeof profileResult>["items"][number];
class ProfileLookupError extends Error {}

const fail = (res: Response, status: number, error: string, message: string): void => {
  res.status(status).json({ error, message });
};

const lookupProfiles = async (ids: string[]): Promise<Map<string, Profile>> => {
  if (!ids.length) return new Map();
  try {
    const target = (process.env.AUTH_SERVICE_URL || "http://localhost:4001").replace(/\/$/, "");
    const response = await fetch(`${target}/internal/admin/users/profiles`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.INTERNAL_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [...new Set(ids)] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Profile service returned ${response.status}`);
    const parsed = profileResult.parse(await response.json());
    return new Map(parsed.items.map((profile) => [profile.id, profile]));
  } catch {
    throw new ProfileLookupError("Unable to load user profiles");
  }
};

export const createAdminFamiliesRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  router.use(requireInternalKey);

  router.get("/", async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return fail(res, 400, "INVALID_QUERY", "page, limit, or q is invalid");
    const { page, limit, q } = parsed.data;
    try {
      const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
      const [families, total] = await prisma.$transaction([
        prisma.familyGroup.findMany({
          where,
          select: { id: true, name: true, ownerId: true, createdAt: true, _count: { select: { members: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.familyGroup.count({ where }),
      ]);
      const profiles = await lookupProfiles(families.map((family) => family.ownerId));
      res.json({
        items: families.map((family) => ({
          id: family.id, name: family.name, memberCount: family._count.members,
          ownerEmail: profiles.get(family.ownerId)?.email ?? "", createdAt: family.createdAt,
        })),
        total, page, limit,
      });
    } catch (error) {
      const upstream = error instanceof ProfileLookupError;
      fail(res, upstream ? 502 : 500, upstream ? "PROFILE_LOOKUP_FAILED" : "INTERNAL_ERROR", upstream ? "Unable to load owner profiles" : "Unable to list families");
    }
  });

  router.get("/:id", async (req, res) => {
    const parsed = detailParams.safeParse(req.params);
    if (!parsed.success) return fail(res, 400, "INVALID_QUERY", "Family id must be a UUID");
    try {
      const family = await prisma.familyGroup.findUnique({
        where: { id: parsed.data.id },
        select: {
          id: true, name: true, ownerId: true, createdAt: true,
          members: { select: { id: true, userId: true, role: true }, orderBy: { joinedAt: "asc" } },
        },
      });
      if (!family) return fail(res, 404, "NOT_FOUND", "Family not found");
      const profiles = await lookupProfiles([family.ownerId, ...family.members.map((member) => member.userId)]);
      res.json({
        id: family.id, name: family.name, memberCount: family.members.length,
        ownerEmail: profiles.get(family.ownerId)?.email ?? "", createdAt: family.createdAt,
        members: family.members.map((member) => ({
          id: member.id, userId: member.userId,
          name: profiles.get(member.userId)?.name ?? null,
          email: profiles.get(member.userId)?.email ?? null,
          role: member.role,
        })),
      });
    } catch (error) {
      const upstream = error instanceof ProfileLookupError;
      fail(res, upstream ? 502 : 500, upstream ? "PROFILE_LOOKUP_FAILED" : "INTERNAL_ERROR", upstream ? "Unable to load member profiles" : "Unable to load family");
    }
  });
  return router;
};
