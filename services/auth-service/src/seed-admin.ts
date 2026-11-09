import { PrismaClient, Role } from ".prisma/client-auth";
import { hashPassword } from "./services/password";

export type AdminSeedResult = "skipped" | "already-exists" | "created";

export async function seedAdmin(prisma: PrismaClient, env: NodeJS.ProcessEnv = process.env): Promise<AdminSeedResult> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return "skipped";

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return "already-exists";

  const result = await prisma.user.createMany({
    data: [{ email, passwordHash: await hashPassword(password), fullName: "Admin", role: Role.ADMIN, isVerified: true }],
    skipDuplicates: true,
  });
  return result.count === 1 ? "created" : "already-exists";
}
