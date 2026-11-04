import type { PrismaClient } from ".prisma/client-admin";

type RetentionPrisma = Pick<PrismaClient, "serviceHealthLog">;

export const retentionCutoff = (now: Date, retentionDays: number): Date =>
  new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

/** Deletes logs older than the retention window. Idempotent: a second run deletes nothing new. */
export const purgeOldHealthLogs = async (prisma: RetentionPrisma, retentionDays: number, now: Date = new Date()): Promise<number> => {
  const result = await prisma.serviceHealthLog.deleteMany({ where: { checkedAt: { lt: retentionCutoff(now, retentionDays) } } });
  return result.count;
};
