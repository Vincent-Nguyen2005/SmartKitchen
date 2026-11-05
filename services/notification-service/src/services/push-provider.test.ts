import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ deviceToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

const expoMock = vi.hoisted(() => ({ sendPushNotificationsAsync: vi.fn(), chunkPushNotifications: vi.fn((messages: unknown[]) => [messages]) }));
vi.mock("expo-server-sdk", () => {
  class Expo {
    static isExpoPushToken = (token: unknown) => typeof token === "string" && token.startsWith("ExponentPushToken[");
    sendPushNotificationsAsync = expoMock.sendPushNotificationsAsync;
    chunkPushNotifications = expoMock.chunkPushNotifications;
  }
  return { Expo };
});

import { createPushProvider, ExpoPushProvider, MockPushProvider } from "./push-provider";

const message = (token: string) => ({ token, title: "t", body: "b", data: { promotionId: "p1" } });

describe("push providers", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { delete process.env.PUSH_PROVIDER; });

  it("selects Expo only when PUSH_PROVIDER=expo and the mock otherwise", () => {
    expect(createPushProvider()).toBeInstanceOf(MockPushProvider);
    process.env.PUSH_PROVIDER = "expo";
    expect(createPushProvider()).toBeInstanceOf(ExpoPushProvider);
  });

  it("mock provider reports every token as delivered", async () => {
    const delivered = await new MockPushProvider().send([message("a"), message("b")]);
    expect([...delivered]).toEqual(["a", "b"]);
  });

  it("Expo provider skips invalid tokens and reports ok receipts as delivered", async () => {
    expoMock.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }]);
    const delivered = await new ExpoPushProvider().send([message("ExponentPushToken[ok]"), message("not-a-token")]);
    expect(expoMock.sendPushNotificationsAsync.mock.calls[0][0]).toEqual([{ to: "ExponentPushToken[ok]", title: "t", body: "b", data: { promotionId: "p1" } }]);
    expect([...delivered]).toEqual(["ExponentPushToken[ok]"]);
  });

  it("deactivates a token when Expo answers DeviceNotRegistered", async () => {
    expoMock.sendPushNotificationsAsync.mockResolvedValue([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "rate", details: { error: "MessageRateExceeded" } },
    ]);
    const delivered = await new ExpoPushProvider().send([message("ExponentPushToken[gone]"), message("ExponentPushToken[busy]")]);
    expect(delivered.size).toBe(0);
    expect(prismaMock.deviceToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.deviceToken.updateMany).toHaveBeenCalledWith({ where: { token: "ExponentPushToken[gone]" }, data: { isActive: false } });
  });
});
