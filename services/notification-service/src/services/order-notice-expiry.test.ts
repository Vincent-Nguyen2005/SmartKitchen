import { describe, expect, it } from "vitest";
import { expiredOrderNoticeWhere, isExpiredOrderNotice, orderNoticeCutoff } from "./order-notice-expiry";

const NOW = new Date("2026-11-27T05:00:00.000Z");
const row = (status: string, hours: number, dedupeKey: string | null = "order:o1") => ({ dedupeKey, createdAt: new Date(NOW.getTime() - hours * 3_600_000), data: { type: "order", orderId: "o1", status } });

describe("finished order notices expire after exactly 72 h", () => {
  it("DELIVERED / FAILED / CANCELLED: visible at 71 h, expired at 72 h", () => {
    for (const status of ["DELIVERED", "FAILED", "CANCELLED"]) {
      expect(isExpiredOrderNotice(row(status, 71), NOW)).toBe(false);
      expect(isExpiredOrderNotice(row(status, 72), NOW)).toBe(true);
    }
  });

  it("SHIPPING and PENDING never expire; rows that are not order notices never expire", () => {
    expect(isExpiredOrderNotice(row("SHIPPING", 1000), NOW)).toBe(false);
    expect(isExpiredOrderNotice(row("PENDING", 1000), NOW)).toBe(false);
    expect(isExpiredOrderNotice(row("DELIVERED", 1000, null), NOW)).toBe(false);
    expect(isExpiredOrderNotice(row("DELIVERED", 1000, "promotion:p1:u1"), NOW)).toBe(false);
  });

  it("the Prisma filter uses the same cutoff, statuses and key prefix (NULL-safe key)", () => {
    expect(orderNoticeCutoff(NOW)).toEqual(new Date("2026-11-24T05:00:00.000Z"));
    expect(expiredOrderNoticeWhere(orderNoticeCutoff(NOW))).toEqual({
      dedupeKey: { not: null, startsWith: "order:" },
      createdAt: { lte: new Date("2026-11-24T05:00:00.000Z") },
      OR: [
        { data: { path: ["status"], equals: "DELIVERED" } },
        { data: { path: ["status"], equals: "FAILED" } },
        { data: { path: ["status"], equals: "CANCELLED" } },
      ],
    });
  });
});
