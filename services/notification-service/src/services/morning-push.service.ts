import { prisma } from "../lib/prisma";
import { createPushProvider, type PushProvider } from "./push-provider";

/**
 * "Chào buổi sáng": the only push (promotions are in-app only). One per user per Vietnam day, to users with an active device token.
 * - Sent from 07:00 (Asia/Ho_Chi_Minh); a run before 07:00 does nothing. If the service was down at 07:00 the job
 *   catches up until 09:59; from 10:00 the day is skipped.
 * - Body: "Chúc bạn một ngày vui vẻ! Bữa sáng nay: A, B." with the family's breakfast dishes for today (menu-service
 *   internal POST /internal/breakfast-today, x-api-key = INTERNAL_API_KEY), at most 3 names then "…". No family, no
 *   breakfast or menu-service unavailable → "Chúc bạn một ngày vui vẻ!" only.
 * - Tap data: { type: "morning", screen: "menu", meal: "BREAKFAST", day } with a breakfast, else { type: "morning",
 *   screen: "home" }; the app opens Lịch on today's breakfast or stays on home.
 * - Idempotent: a morning_pushes row (userId, day) is written BEFORE sending; a user who already has one is skipped,
 *   so restarts, retries and overlapping runs never send twice. A failed send is not retried that day.
 * - Push only: no row in notifications (not in the Thông báo feed nor the bell badge). Logs carry counts only.
 */
export const MORNING_TITLE = "Chào buổi sáng";
export const MORNING_GREETING = "Chúc bạn một ngày vui vẻ!";
const MORNING_START_MINUTES = 7 * 60; // 07:00
const CATCH_UP_END_MINUTES = 10 * 60; // last run at 09:59
const MAX_DISHES = 3;

/** Vietnam (UTC+7, no daylight saving) day YYYY-MM-DD and minutes since midnight. */
export const vnClock = (now: Date): { day: string; minutes: number } => {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return { day: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
};

/** 07:00–09:59 Vietnam time: the morning push may be sent (or caught up). */
export const inMorningWindow = (now: Date): boolean => {
  const { minutes } = vnClock(now);
  return minutes >= MORNING_START_MINUTES && minutes < CATCH_UP_END_MINUTES;
};

/** "Chúc bạn một ngày vui vẻ! Bữa sáng nay: A, B." — at most 3 names, then "…"; no dishes → the greeting only. */
export const morningBody = (dishes: string[]): string => {
  const names = dishes.map((dish) => dish.trim()).filter(Boolean);
  if (names.length === 0) return MORNING_GREETING;
  const shown = names.slice(0, MAX_DISHES).join(", ");
  return `${MORNING_GREETING} Bữa sáng nay: ${shown}${names.length > MAX_DISHES ? "…" : "."}`;
};

export type BreakfastLookup = (userIds: string[]) => Promise<Map<string, string[]>>;

/** Today's family breakfast per user from menu-service; an empty map when it cannot answer (greeting-only pushes). */
export const lookupBreakfasts: BreakfastLookup = async (userIds) => {
  const result = new Map<string, string[]>();
  const key = process.env.INTERNAL_API_KEY;
  if (!key || userIds.length === 0) return result;
  const baseUrl = (process.env.MENU_SERVICE_URL ?? "http://localhost:4007").replace(/\/+$/, "");
  for (let start = 0; start < userIds.length; start += 500) {
    try {
      const response = await fetch(`${baseUrl}/internal/breakfast-today`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ userIds: userIds.slice(start, start + 500) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) { console.warn(JSON.stringify({ event: "morning_push_menu_unavailable", status: response.status })); continue; }
      const body = await response.json() as { items?: Array<{ userId?: unknown; dishes?: unknown }> };
      for (const item of body.items ?? []) {
        if (typeof item.userId === "string" && Array.isArray(item.dishes)) result.set(item.userId, item.dishes.filter((dish): dish is string => typeof dish === "string"));
      }
    } catch {
      console.warn(JSON.stringify({ event: "morning_push_menu_unavailable" }));
    }
  }
  return result;
};

let running = false;

/** One job run (cron every 5 minutes, 07:00–09:59). Returns how many users got the push in this run. */
export const runMorningPush = async (options: { now?: Date; provider?: PushProvider; breakfasts?: BreakfastLookup } = {}): Promise<number> => {
  const now = options.now ?? new Date();
  if (running || !inMorningWindow(now)) return 0;
  running = true;
  try {
    const { day } = vnClock(now);
    const tokens = await prisma.deviceToken.findMany({ where: { isActive: true }, select: { userId: true, token: true } });
    const users = [...new Set(tokens.map((token) => token.userId))];
    if (users.length === 0) return 0;
    const done = new Set((await prisma.morningPush.findMany({ where: { day, userId: { in: users } }, select: { userId: true } })).map((row) => row.userId));
    const pending = users.filter((userId) => !done.has(userId));
    // Claim each user for today first (the primary key makes a second claim fail), then send.
    const claimed: string[] = [];
    for (const userId of pending) {
      try {
        await prisma.morningPush.create({ data: { userId, day } });
        claimed.push(userId);
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    if (claimed.length === 0) return 0;
    const breakfasts = await (options.breakfasts ?? lookupBreakfasts)(claimed);
    const claimedSet = new Set(claimed);
    const messages = tokens.filter((token) => claimedSet.has(token.userId)).map((token) => {
      const dishes = breakfasts.get(token.userId) ?? [];
      return {
        token: token.token,
        title: MORNING_TITLE,
        body: morningBody(dishes),
        data: dishes.length > 0 ? { type: "morning", screen: "menu", meal: "BREAKFAST", day } : { type: "morning", screen: "home" },
      };
    });
    const provider = options.provider ?? createPushProvider();
    const delivered = await provider.send(messages).catch(() => new Set<string>());
    console.log(JSON.stringify({ event: "morning_push_sent", users: claimed.length, devices: messages.length, delivered: delivered.size }));
    return claimed.length;
  } finally {
    running = false;
  }
};
