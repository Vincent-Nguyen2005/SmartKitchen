import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory notifications table with the unique dedupeKey, like Postgres (createMany skipDuplicates). */
const rows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const prismaMock = vi.hoisted(() => ({
  promotion: { findUnique: vi.fn(), findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  notification: { findMany: vi.fn(), createMany: vi.fn() },
  notificationDismissal: { findMany: vi.fn() },
}));
const dismissals = vi.hoisted(() => [] as Array<{ userId: string; key: string }>);
const pushSend = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("./push-provider", () => ({ createPushProvider: () => ({ send: pushSend }) }));

import { addPromotionRows, dispatchPromotion, ensureActivePromotionRows, promotionDedupeKey } from "./promotion-dispatch.service";

const promotion = (id: string) => ({ id, partnerId: "partner-1", title: `KM ${id}`, description: "Chỉ hôm nay", discountInfo: null });

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  dismissals.length = 0;
  prismaMock.notificationDismissal.findMany.mockImplementation(async ({ where }: { where: { userId: { in: string[] }; key: { in: string[] } } }) =>
    dismissals.filter((row) => where.userId.in.includes(row.userId) && where.key.in.includes(row.key)));
  prismaMock.notification.findMany.mockImplementation(async ({ where }: { where: { userId: { in: string[] }; OR: Array<{ data: { equals: string } }> } }) =>
    rows.filter((row) => row.dedupeKey === null && where.userId.in.includes(String(row.userId)) && where.OR.some((entry) => (row.data as { promotionId: string }).promotionId === entry.data.equals)));
  prismaMock.notification.createMany.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
    let count = 0;
    for (const row of data) if (!rows.some((existing) => existing.dedupeKey === row.dedupeKey)) { rows.push(row); count += 1; }
    return { count };
  });
});

describe("promotions are in-app only", () => {
  it("an active promotion becomes one unread Thông báo row for the reader, and nothing is pushed", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([promotion("p1"), promotion("p2")]);
    expect(await ensureActivePromotionRows("u1", new Date("2026-11-27T02:00:00Z"))).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: "u1", type: "PROMOTION", channel: "IN_APP", status: "SENT", title: "KM p1", body: "Chỉ hôm nay", data: { promotionId: "p1", partnerId: "partner-1" }, dedupeKey: "promotion:p1:u1" });
    expect(pushSend).not.toHaveBeenCalled();
    // Only active promotions are read (no quiet window: in-app rows any time of day).
    expect(prismaMock.promotion.findMany.mock.calls[0][0].where).toMatchObject({ isActive: true });
  });

  it("no duplicates: repeated reads, restarts and parallel reads keep one row per user and promotion", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([promotion("p1")]);
    const [first, second] = await Promise.all([ensureActivePromotionRows("u1"), ensureActivePromotionRows("u1")]);
    expect(first + second).toBe(1);
    expect(await ensureActivePromotionRows("u1")).toBe(0);
    expect(rows.filter((row) => row.userId === "u1")).toHaveLength(1);
    // Another user gets their own row.
    expect(await ensureActivePromotionRows("u2")).toBe(1);
  });

  it("a row made before the dedupe key existed counts as already there", async () => {
    rows.push({ userId: "u1", type: "PROMOTION", data: { promotionId: "p1" }, dedupeKey: null });
    expect(await addPromotionRows([promotion("p1")], ["u1", "u2"])).toBe(1);
    expect(rows.map((row) => row.dedupeKey)).toEqual([null, promotionDedupeKey("p1", "u2")]);
  });

  it("a promotion the user deleted in Thông báo is never made again for them (others still get it)", async () => {
    dismissals.push({ userId: "u1", key: "promotion:p1" });
    prismaMock.promotion.findMany.mockResolvedValue([promotion("p1"), promotion("p2")]);
    expect(await ensureActivePromotionRows("u1")).toBe(1);
    expect(rows.map((row) => row.dedupeKey)).toEqual(["promotion:p2:u1"]);
    expect(await ensureActivePromotionRows("u2")).toBe(2);
  });

  it("no active promotion: nothing is written", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([]);
    expect(await ensureActivePromotionRows("u1")).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("admin dispatch (feed only)", () => {
  it("adds the promotion's feed rows for the given users, once, with a counts-only log; no push", async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(promotion("p1"));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await dispatchPromotion("p1", ["u1", "u2", "u2"])).toBe(2);
    expect(await dispatchPromotion("p1", ["u1", "u2"])).toBe(0);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({ event: "promotion_feed_dispatch", users: 2, created: 2 });
    expect(pushSend).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("returns 0 for an unknown promotion", async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(null);
    expect(await dispatchPromotion("missing", ["u1"])).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});
