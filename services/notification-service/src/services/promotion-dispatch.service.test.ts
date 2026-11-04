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

  it("skips users who disabled push or promotions", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2"), token("u3")]);
    prismaMock.notificationPreference.findMany.mockResolvedValue([
      { userId: "u1", pushEnabled: false, promotionEnabled: true },
      { userId: "u2", pushEnabled: true, promotionEnabled: false },
    ]);
    const provider = providerDelivering(["ExponentPushToken[u3]"]);
    expect(await dispatchPromotion("p1", ["u1", "u2", "u3"], provider)).toBe(1);
    expect(vi.mocked(provider.send).mock.calls[0][0].map((message) => message.token)).toEqual(["ExponentPushToken[u3]"]);
  });

  it("skips users inside their quiet hours (evaluated in DEFAULT_TIMEZONE)", async () => {
    prismaMock.deviceToken.findMany.mockResolvedValue([token("u1"), token("u2")]);
    prismaMock.notificationPreference.findMany.mockResolvedValue([{ userId: "u1", pushEnabled: true, promotionEnabled: true, quietHoursStart: "09:00", quietHoursEnd: "11:00" }]);
    expect(await dispatchPromotion("p1", ["u1", "u2"], providerDelivering(["ExponentPushToken[u2]"]))).toBe(1);
    expect(prismaMock.notification.create.mock.calls.map((call) => call[0].data.userId)).toEqual(["u2"]);
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

describe("dispatchActivePromotions (cron job)", () => {
  it("dispatches every active promotion to every user with an active token", async () => {
    prismaMock.promotion.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
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
