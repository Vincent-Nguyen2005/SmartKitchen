import { prisma } from "../lib/prisma";
import { isWithinQuietHours } from "../lib/promotion";
import { createPushProvider, type PushProvider } from "./push-provider";

/**
 * Fixed quiet window for promotion PUSH (not configurable, same for everyone): 22:00–07:00 Vietnam time. Nothing is
 * sent inside it; the first dispatch run from 07:00 sends what is still active (a promotion that ended overnight is
 * no longer active, so it is never sent). The in-app Thông báo feed lists active promotions on its own and is not
 * affected.
 */
export const PROMOTION_QUIET_START = "22:00";
export const PROMOTION_QUIET_END = "07:00";
export const PROMOTION_TIME_ZONE = "Asia/Ho_Chi_Minh";
/**
 * The cron job only pushes a promotion during its first 24 hours (counted from when it started or was created,
 * whichever is later; the overnight quiet window fits inside). Older active promotions are never pushed by the job,
 * so turning jobs on, a restart, or a phone that registers its token later does not get a burst of old promotions.
 * They still show in the Thông báo feed. (An explicit POST /promotions/:id/dispatch is not limited.)
 */
export const PROMOTION_PUSH_MAX_AGE_MS = 24 * 3_600_000;
export const isFreshPromotion = (promotion: { startsAt: Date; createdAt: Date }, now: Date = new Date()): boolean =>
  now.getTime() - Math.max(promotion.startsAt.getTime(), promotion.createdAt.getTime()) <= PROMOTION_PUSH_MAX_AGE_MS;
export const inPromotionQuietWindow = (now: Date = new Date()): boolean =>
  isWithinQuietHours(now, PROMOTION_QUIET_START, PROMOTION_QUIET_END, PROMOTION_TIME_ZONE);

let running = false;

/**
 * Sends a promotion to every given user with an active device token, once per user and promotion, outside the
 * quiet window (inside it: nothing is created or sent, 0; a later run sends it).
 * There are no notification settings any more (the app's "Cài đặt thông báo" was removed): stored
 * notification_preferences rows (push / promotion off, personal quiet hours) are kept but ignored.
 */
export const dispatchPromotion = async (promotionId: string, userIds: string[], provider: PushProvider = createPushProvider()): Promise<number> => {
  if (inPromotionQuietWindow()) return 0;
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) return 0;
  const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds }, isActive: true } });
  const existing = await prisma.notification.findMany({ where: { userId: { in: userIds }, type: "PROMOTION", data: { path: ["promotionId"], equals: promotionId } } });
  const sentUsers = new Set(existing.map((notification) => notification.userId));
  const targets = tokens.filter((token) => !sentUsers.has(token.userId));
  if (targets.length === 0) return 0;
  const notifications = await prisma.$transaction(targets.map((target) => prisma.notification.create({ data: {
    userId: target.userId,
    type: "PROMOTION",
    title: promotion.title,
    body: promotion.description || promotion.discountInfo || promotion.title,
    data: { promotionId: promotion.id, partnerId: promotion.partnerId },
    channel: "PUSH",
    status: "PENDING",
  } })));
  try {
    const delivered = await provider.send(targets.map((target) => ({ token: target.token, title: promotion.title, body: promotion.description || promotion.discountInfo || promotion.title, data: { promotionId } })));
    await prisma.$transaction(notifications.map((notification, index) => prisma.notification.update({ where: { id: notification.id }, data: delivered.has(targets[index].token) ? { status: "SENT", sentAt: new Date() } : { status: "FAILED" } })));
  } catch {
    await prisma.$transaction(notifications.map((notification) => prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } })));
  }
  return notifications.length;
};

export const dispatchActivePromotions = async (): Promise<void> => {
  if (running) return;
  // Inside the quiet window: no work at all; the first run from 07:00 picks up every still-active promotion.
  if (inPromotionQuietWindow()) return;
  running = true;
  try {
    const now = new Date();
    const active = await prisma.promotion.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } } });
    const promotions = active.filter((promotion) => isFreshPromotion(promotion, now));
    const users = await prisma.deviceToken.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } });
    let sent = 0;
    for (const promotion of promotions) sent += await dispatchPromotion(promotion.id, users.map((user) => user.userId));
    // Counts only (no ids, titles or users).
    console.log(JSON.stringify({ event: "promotion_dispatch_run", active: active.length, fresh: promotions.length, users: users.length, sent }));
  } finally {
    running = false;
  }
};
