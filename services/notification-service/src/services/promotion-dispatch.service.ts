import { prisma } from "../lib/prisma";
import { isWithinQuietHours } from "../lib/promotion";
import { createPushProvider, type PushProvider } from "./push-provider";

let running = false;

export const dispatchPromotion = async (promotionId: string, userIds: string[], provider: PushProvider = createPushProvider()): Promise<number> => {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) return 0;
  const preferences = await prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } });
  const preferenceByUser = new Map(preferences.map((preference) => [preference.userId, preference]));
  const tokens = await prisma.deviceToken.findMany({ where: { userId: { in: userIds }, isActive: true } });
  const existing = await prisma.notification.findMany({ where: { userId: { in: userIds }, type: "PROMOTION", data: { path: ["promotionId"], equals: promotionId } } });
  const sentUsers = new Set(existing.map((notification) => notification.userId));
  const timezone = process.env.DEFAULT_TIMEZONE || "Asia/Ho_Chi_Minh";
  const targets = tokens.filter((token) => {
    const preference = preferenceByUser.get(token.userId);
    return !sentUsers.has(token.userId) && preference?.pushEnabled !== false && preference?.promotionEnabled !== false && !isWithinQuietHours(new Date(), preference?.quietHoursStart || null, preference?.quietHoursEnd || null, timezone);
  });
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
  running = true;
  try {
    const promotions = await prisma.promotion.findMany({ where: { isActive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } } });
    const users = await prisma.deviceToken.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } });
    for (const promotion of promotions) await dispatchPromotion(promotion.id, users.map((user) => user.userId));
  } finally {
    running = false;
  }
};
