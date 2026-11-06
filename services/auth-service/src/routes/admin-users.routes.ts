import { Router, type Request, type Response } from "express";
import { PrismaClient, Role } from ".prisma/client-auth";
import { z } from "zod";
import { requireInternalKey } from "./internal-key";
import { isDatabaseUnavailable } from "../database-error";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  role: z.nativeEnum(Role).optional(),
});
const profileBody = z.object({ ids: z.array(z.string().uuid()).max(1000) });

const fail = (res: Response, status: number, error: string, message: string): void => {
  res.status(status).json({ error, message });
};

export const createAdminUsersRouter = (prisma: PrismaClient): Router => {
  const router = Router();
  router.use(requireInternalKey);

  router.post("/profiles", async (req: Request, res: Response) => {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "INVALID_QUERY", "ids must be an array of at most 1000 UUIDs");
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: parsed.data.ids } },
        select: { id: true, email: true, fullName: true },
      });
      res.json({ items: users.map((user) => ({ id: user.id, email: user.email, name: user.fullName })) });
    } catch (error) {
      console.error("[auth-service] admin user profiles failed", error);
      const unavailable = isDatabaseUnavailable(error);
      fail(res, unavailable ? 503 : 500, unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", unavailable ? "Auth database is unavailable" : "Unable to load user profiles");
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) return fail(res, 400, "INVALID_QUERY", "page, limit, q, or role is invalid");
    const { page, limit, q, role } = parsed.data;
    const where = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [
        { email: { contains: q, mode: "insensitive" as const } },
        { fullName: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    };
    try {
      const [users, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          select: { id: true, email: true, fullName: true, role: true, isVerified: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);
      res.json({
        items: users.map((user) => ({
          id: user.id, email: user.email, name: user.fullName,
          role: user.role, emailVerified: user.isVerified, createdAt: user.createdAt,
        })),
        total, page, limit,
      });
    } catch (error) {
      console.error("[auth-service] admin user list failed", error);
      const unavailable = isDatabaseUnavailable(error);
      fail(res, unavailable ? 503 : 500, unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR", unavailable ? "Auth database is unavailable" : "Unable to list users");
    }
  });
  return router;
};
