import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => new Set<string>());
const prismaMock = vi.hoisted(() => ({
  deviceToken: { findMany: vi.fn() },
  morningPush: { findMany: vi.fn(), create: vi.fn() },
  notification: { create: vi.fn() },
}));
vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { inMorningWindow, MORNING_TITLE, morningBody, runMorningPush, vnClock } from "./morning-push.service";
import type { PushProvider } from "./push-provider";

// Vietnam time = UTC + 7.
const vn = (time: string, day = "2026-11-27") => new Date(new Date(`${day}T${time}:00Z`).getTime() - 7 * 3_600_000);
const provider = (): PushProvider => ({ send: vi.fn(async (messages: Array<{ token: string }>) => new Set(messages.map((message) => message.token))) });
const breakfasts = (entries: Record<string, string[]>) => vi.fn(async () => new Map(Object.entries(entries)));

beforeEach(() => {
  vi.clearAllMocks();
  sent.clear();
  prismaMock.deviceToken.findMany.mockResolvedValue([
    { userId: "u1", token: "ExponentPushToken[u1a]" },
    { userId: "u1", token: "ExponentPushToken[u1b]" },
    { userId: "u2", token: "ExponentPushToken[u2]" },
  ]);
  // In-memory morning_pushes table with the (userId, day) primary key.
  prismaMock.morningPush.findMany.mockImplementation(async ({ where }: { where: { day: string } }) =>
    [...sent].filter((key) => key.endsWith(`|${where.day}`)).map((key) => ({ userId: key.split("|")[0] })));
  prismaMock.morningPush.create.mockImplementation(async ({ data }: { data: { userId: string; day: string } }) => {
    const key = `${data.userId}|${data.day}`;
    if (sent.has(key)) throw Object.assign(new Error("unique"), { code: "P2002" });
    sent.add(key);
    return data;
  });
});

describe("morning push body", () => {
  it("greeting with today's breakfast; greeting only without a menu", () => {
    expect(morningBody(["Bánh mì trứng ốp la", "Bún riêu cua"])).toBe("Chúc bạn một ngày vui vẻ! Bữa sáng nay: Bánh mì trứng ốp la, Bún riêu cua.");
    expect(morningBody([])).toBe("Chúc bạn một ngày vui vẻ!");
    expect(morningBody(["  "])).toBe("Chúc bạn một ngày vui vẻ!");
  });

  it("at most 3 dish names, then …", () => {
    expect(morningBody(["A", "B", "C"])).toBe("Chúc bạn một ngày vui vẻ! Bữa sáng nay: A, B, C.");
    expect(morningBody(["A", "B", "C", "D", "E"])).toBe("Chúc bạn một ngày vui vẻ! Bữa sáng nay: A, B, C…");
  });
});

describe("morning push window (Asia/Ho_Chi_Minh)", () => {
  it("07:00 to 09:59 only", () => {
    expect([inMorningWindow(vn("06:59")), inMorningWindow(vn("07:00")), inMorningWindow(vn("09:59")), inMorningWindow(vn("10:00"))]).toEqual([false, true, true, false]);
    expect(vnClock(vn("07:00"))).toEqual({ day: "2026-11-27", minutes: 420 });
  });
});

describe("runMorningPush", () => {
  it("does nothing before 07:00", async () => {
    const push = provider();
    expect(await runMorningPush({ now: vn("06:55"), provider: push, breakfasts: breakfasts({}) })).toBe(0);
    expect(push.send).not.toHaveBeenCalled();
    expect(prismaMock.deviceToken.findMany).not.toHaveBeenCalled();
  });

  it("sends at 07:00 to every device of every user with a token; tap opens today's breakfast", async () => {
    const push = provider();
    expect(await runMorningPush({ now: vn("07:00"), provider: push, breakfasts: breakfasts({ u1: ["Bánh mì trứng ốp la", "Bún riêu cua"] }) })).toBe(2);
    const messages = vi.mocked(push.send).mock.calls[0][0];
    expect(messages.map((message) => message.token)).toEqual(["ExponentPushToken[u1a]", "ExponentPushToken[u1b]", "ExponentPushToken[u2]"]);
    expect(MORNING_TITLE).toBe("Chào buổi sáng"); // no emoji
    expect(messages[0]).toMatchObject({ title: "Chào buổi sáng", body: "Chúc bạn một ngày vui vẻ! Bữa sáng nay: Bánh mì trứng ốp la, Bún riêu cua.", data: { type: "morning", screen: "menu", meal: "BREAKFAST", day: "2026-11-27" } });
    // u2 has no family / breakfast: greeting only, tap opens the app home.
    expect(messages[2]).toMatchObject({ body: "Chúc bạn một ngày vui vẻ!", data: { type: "morning", screen: "home" } });
    // Push only: nothing in the Thông báo feed.
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("once per user per day: a second run (or a restart) the same day sends nothing; the next day sends again", async () => {
    await runMorningPush({ now: vn("07:00"), provider: provider(), breakfasts: breakfasts({}) });
    const again = provider();
    expect(await runMorningPush({ now: vn("07:05"), provider: again, breakfasts: breakfasts({}) })).toBe(0);
    expect(again.send).not.toHaveBeenCalled();
    expect(await runMorningPush({ now: vn("07:00", "2026-11-28"), provider: provider(), breakfasts: breakfasts({}) })).toBe(2);
  });

  it("a user claimed by an overlapping run is skipped (primary key), never sent twice", async () => {
    sent.add("u1|2026-11-27"); // claimed after this run read the table
    prismaMock.morningPush.findMany.mockResolvedValueOnce([]);
    const push = provider();
    expect(await runMorningPush({ now: vn("07:00"), provider: push, breakfasts: breakfasts({}) })).toBe(1);
    expect(vi.mocked(push.send).mock.calls[0][0].map((message) => message.token)).toEqual(["ExponentPushToken[u2]"]);
  });

  it("catches up until 09:59 after downtime, then skips the day", async () => {
    expect(await runMorningPush({ now: vn("09:55"), provider: provider(), breakfasts: breakfasts({}) })).toBe(2);
    sent.clear();
    const late = provider();
    expect(await runMorningPush({ now: vn("10:00"), provider: late, breakfasts: breakfasts({}) })).toBe(0);
    expect(late.send).not.toHaveBeenCalled();
  });
});
