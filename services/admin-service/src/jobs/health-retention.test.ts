import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from ".prisma/client-admin";
import { purgeOldHealthLogs, retentionCutoff } from "./health-retention";

describe("health log retention", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");

  it("computes the cutoff as now minus the retention days", () => {
    expect(retentionCutoff(now, 14).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  it("deletes only logs strictly older than the cutoff and returns the count", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = { serviceHealthLog: { deleteMany } } as unknown as Pick<PrismaClient, "serviceHealthLog">;
    await expect(purgeOldHealthLogs(prisma, 14, now)).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { checkedAt: { lt: new Date("2026-10-21T00:00:00.000Z") } } });
  });

  it("is idempotent: a second run with nothing left to delete returns 0", async () => {
    const deleteMany = vi.fn().mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
    const prisma = { serviceHealthLog: { deleteMany } } as unknown as Pick<PrismaClient, "serviceHealthLog">;
    expect(await purgeOldHealthLogs(prisma, 14, now)).toBe(2);
    expect(await purgeOldHealthLogs(prisma, 14, now)).toBe(0);
    expect(deleteMany.mock.calls[0]).toEqual(deleteMany.mock.calls[1]);
  });
});
