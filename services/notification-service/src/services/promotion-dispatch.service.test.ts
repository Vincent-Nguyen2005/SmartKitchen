import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  promotion: { findUnique: vi.fn(), findMany: vi.fn() },
  notificationPreference: { findMany: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  notification: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { dispatchActivePromotions, dispatchPromotion } from "./promotion-dispatch.service";
import type { PushProvider } from "./push-provider";

const promotion = { id: "p1", partnerId: "partner-1", title: "Cà chua giảm 20%", description: "Chỉ hôm nay", discountInfo: null };
const token = (userId: string, value = `ExponentPushToken[${userId}]`) => ({ userId, token: value, isActive: true });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T03:00:00Z")); // 10:00 in Ho Chi Minh City
  prismaMock.promotion.findUnique.mockResolvedValue(promotion);
  prismaMock.notificationPreference.findMany.mockResolvedValue([]);
  prismaMock.notification.findMany.mockResolvedValue([]);
  prismaMock.notification.create.mockImplementation(({ data }: { data: { userId: string } }) => ({ id: `n-${data.userId}`, ...data }));
  prismaMock.notification.update.mockImplementation((args: unknown) => args);
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});
afterEach(() => { vi.useRealTimers(); });

const providerDelivering = (delivered: string[]): PushProvider => ({ send: vi.fn().mockResolvedValue(new Set(delivered)) });
const updates = () => (prismaMock.$transaction.mock.calls.at(-1)?.[0] ?? []) as { where: { id: string }; data: { status: string } }[];

describe("dispatchPromotion", () => {
  it("returns 0 for an unknown promotion without touching tokens", async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(null);
    expect(await dispatchPromotion("missing", ["u1"], providerDelivering([]))).toBe(0);
    expect(prismaMock.deviceToken.findMany).not.toHaveBeenCalled();
  });

  it("creates PENDING notifications then marks delivered ones SENT and the rest FAILED", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2")]);
    const provider = providerDelivering(["ExponentPushToken[u1]"]);
    expect(await dispatchPromotion("p1", ["u1", "u2"], provider)).toBe(2);
    expect(prismaMock.notification.create.mock.calls[0][0].data).toMatchObject({ type: "PROMOTION", channel: "PUSH", status: "PENDING", data: { promotionId: "p1", partnerId: "partner-1" } });
    expect(updates().map((update) => [update.where.id, update.data.status])).toEqual([["n-u1", "SENT"], ["n-u2", "FAILED"]]);
  });

  it("ignores stored notification settings: push / promotions off and quiet hours no longer skip anyone", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2"), token("u3")]);
    // Old rows from the removed "Cài đặt thông báo" screen; the dispatcher no longer reads them.
    prismaMock.notificationPreference.findMany.mockResolvedValue([
      { userId: "u1", pushEnabled: false, promotionEnabled: true },
      { userId: "u2", pushEnabled: true, promotionEnabled: false, quietHoursStart: "00:00", quietHoursEnd: "23:59" },
    ]);
    const provider = providerDelivering(["ExponentPushToken[u1]", "ExponentPushToken[u2]", "ExponentPushToken[u3]"]);
    expect(await dispatchPromotion("p1", ["u1", "u2", "u3"], provider)).toBe(3);
    expect(vi.mocked(provider.send).mock.calls[0][0].map((message) => message.token)).toEqual(["ExponentPushToken[u1]", "ExponentPushToken[u2]", "ExponentPushToken[u3]"]);
    expect(prismaMock.notificationPreference.findMany).not.toHaveBeenCalled();
  });

  it("does not notify a user twice for the same promotion", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2")]);
    prismaMock.notification.findMany.mockResolvedValue([{ userId: "u1" }]);
    expect(await dispatchPromotion("p1", ["u1", "u2"], providerDelivering(["ExponentPushToken[u2]"]))).toBe(1);
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({ where: { userId: { in: ["u1", "u2"] }, type: "PROMOTION", data: { path: ["promotionId"], equals: "p1" } } });
  });

  it("marks every notification FAILED when the provider throws", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2")]);
    const provider: PushProvider = { send: vi.fn().mockRejectedValue(new Error("expo down")) };
    expect(await dispatchPromotion("p1", ["u1", "u2"], provider)).toBe(2);
    expect(updates().every((update) => update.data.status === "FAILED")).toBe(true);
  });

  it("returns 0 and sends nothing when no target remains", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([]);
    const provider = providerDelivering([]);
    expect(await dispatchPromotion("p1", ["u1"], provider)).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });
});

describe("promotion quiet window 22:00–07:00 (Asia/Ho_Chi_Minh)", () => {
  const at = (iso: string) => vi.setSystemTime(new Date(iso));

  it("defers sending inside the window: nothing is created or pushed", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1")]);
    const provider = providerDelivering(["ExponentPushToken[u1]"]);
    for (const time of ["2026-11-04T15:00:00Z", "2026-11-04T18:00:00Z", "2026-11-04T23:59:00Z"]) { // 22:00, 01:00, 06:59
      at(time);
      expect(await dispatchPromotion("p1", ["u1"], provider)).toBe(0);
    }
    expect(provider.send).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    at("2026-11-04T14:59:00Z"); // 21:59: still sends
    expect(await dispatchPromotion("p1", ["u1"], provider)).toBe(1);
  });

  it("the 07:00 run sends the deferred promotion, once per user", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2")]);
    at("2026-11-05T00:00:00Z"); // 07:00
    expect(await dispatchPromotion("p1", ["u1", "u2"], providerDelivering(["ExponentPushToken[u1]", "ExponentPushToken[u2]"]))).toBe(2);
    // The next run finds both notifications already made: no duplicates.
    prismaMock.notification.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    at("2026-11-05T00:15:00Z");
    const again = providerDelivering([]);
    expect(await dispatchPromotion("p1", ["u1", "u2"], again)).toBe(0);
    expect(again.send).not.toHaveBeenCalled();
  });

  it("the cron job does nothing inside the window and only dispatches promotions still active at 07:00", async () => {
    at("2026-11-04T20:00:00Z"); // 03:00
    await dispatchActivePromotions();
    expect(prismaMock.promotion.findMany).not.toHaveBeenCalled();
    at("2026-11-05T00:00:00Z"); // 07:00
    prismaMock.promotion.findMany.mockResolvedValue([]); // the one that ended at 05:00 is not active any more
    prismaMock.deviceToken.findMany.mockResolvedValue([{ userId: "u1" }]);
    await dispatchActivePromotions();
    const where = prismaMock.promotion.findMany.mock.calls[0][0].where as { endsAt: { gte: Date } };
    expect(where.endsAt.gte.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(prismaMock.promotion.findUnique).not.toHaveBeenCalled();
  });
});

const fresh = (id: string, hoursAgo = 1) => ({ id, startsAt: new Date(Date.now() - hoursAgo * 3_600_000), createdAt: new Date(Date.now() - hoursAgo * 3_600_000) });

describe("first run / restart: no burst of old promotions", () => {
  it("the job only pushes promotions in their first 24 hours (from start or creation, whichever is later)", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([
      fresh("p-new", 2),
      fresh("p-day", 24),
      fresh("p-old", 25),
      { id: "p-backdated", startsAt: new Date(Date.now() - 30 * 24 * 3_600_000), createdAt: new Date(Date.now() - 3_600_000) }, // synced today
    ]);
    prismaMock.deviceToken.findMany.mockResolvedValueOnce([{ userId: "u1" }]).mockResolvedValue([token("u1")]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await dispatchActivePromotions();
    expect(prismaMock.promotion.findUnique.mock.calls.map((call) => call[0].where.id)).toEqual(["p-new", "p-day", "p-backdated"]);
    // Counts only in the log.
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual({ event: "promotion_dispatch_run", active: 4, fresh: 3, users: 1, sent: 3 });
    log.mockRestore();
  });

  it("a restart does not send again: users who already have the promotion's notification are skipped", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([fresh("p1")]);
    prismaMock.deviceToken.findMany.mockResolvedValueOnce([{ userId: "u1" }]).mockResolvedValue([token("u1")]);
    prismaMock.notification.findMany.mockResolvedValue([{ userId: "u1" }]);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await dispatchActivePromotions();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe("dispatchActivePromotions (cron job)", () => {
  it("dispatches every active promotion to every user with an active token", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([fresh("p1"), fresh("p2")]);
    prismaMock.deviceToken.findMany.mockResolvedValueOnce([{ userId: "u1" }]).mockResolvedValue([]);
    await dispatchActivePromotions();
    expect(prismaMock.promotion.findUnique).toHaveBeenCalledTimes(2);
  });

  it("ignores a run that starts while the previous one is still running", async () => {
    let release: (value: unknown) => void = () => undefined;
    prismaMock.promotion.findMany
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValue([]);
    prismaMock.deviceToken.findMany.mockResolvedValue([]);
    const first = dispatchActivePromotions();
    await dispatchActivePromotions(); // overlapping run returns immediately
    expect(prismaMock.promotion.findMany).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    await dispatchActivePromotions(); // guard is released afterwards
    expect(prismaMock.promotion.findMany).toHaveBeenCalledTimes(2);
  });

  it("releases the guard even when a run fails", async () => {
    prismaMock.promotion.findMany.mockRejectedValueOnce(new Error("db down")).mockResolvedValue([]);
    prismaMock.deviceToken.findMany.mockResolvedValue([]);
    await expect(dispatchActivePromotions()).rejects.toThrow("db down");
    await dispatchActivePromotions();
    expect(prismaMock.promotion.findMany).toHaveBeenCalledTimes(2);
  });
});
