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
    const promotions = await prisma.promotion.findMany({ where: { isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } });
    const users = await prisma.deviceToken.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } });
    for (const promotion of promotions) await dispatchPromotion(promotion.id, users.map((user) => user.userId));
  } finally {
    running = false;
  }
};
