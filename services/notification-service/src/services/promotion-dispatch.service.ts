import { prisma } from "../lib/prisma";

/**
 * Promotions are IN-APP ONLY: they become Thông báo feed rows (type PROMOTION, channel IN_APP, status SENT = unread,
 * counted in the bell badge) and are never pushed. The daily 07:00 "Chào buổi sáng" is the only push
 * (morning-push.service.ts).
 *
 * - One row per user and promotion: dedupeKey "promotion:<promotionId>:<userId>" is unique, rows are written with
 *   createMany(skipDuplicates), and rows from before the key existed are found by data.promotionId. Restarts, retries
 *   and parallel reads (feed + badge) never duplicate.
 * - When: a user's rows for every currently active promotion are made the first time they read their notifications
 *   after the promotion started (GET /notifications, which the feed and the bell badge both call). This reaches every
 *   user, not only those with a push token, and needs no job, so there is no quiet window and no burst on start.
 * - An admin's POST /promotions/:id/dispatch adds the same rows for the given users at once (feed only, no push).
 */
type PromotionRow = { id: string; partnerId: string; title: string; description: string | null; discountInfo: string | null };

export const promotionDedupeKey = (promotionId: string, userId: string): string => `promotion:${promotionId}:${userId}`;

/** Creates the missing feed rows of `promotions` for `userIds`; returns how many were created. */
export const addPromotionRows = async (promotions: PromotionRow[], userIds: string[], now: Date = new Date()): Promise<number> => {
  const users = [...new Set(userIds.filter(Boolean))];
  if (promotions.length === 0 || users.length === 0) return 0;
  // Rows made before dedupeKey existed (data.promotionId only).
  const legacy = await prisma.notification.findMany({
    where: { userId: { in: users }, type: "PROMOTION", dedupeKey: null, OR: promotions.map((promotion) => ({ data: { path: ["promotionId"], equals: promotion.id } })) },
    select: { userId: true, data: true },
  });
  const had = new Set(legacy.map((row) => promotionDedupeKey(String((row.data as { promotionId?: unknown } | null)?.promotionId), row.userId)));
  const data = promotions.flatMap((promotion) => users
    .filter((userId) => !had.has(promotionDedupeKey(promotion.id, userId)))
    .map((userId) => ({
      userId,
      type: "PROMOTION" as const,
      title: promotion.title,
      body: promotion.description || promotion.discountInfo || promotion.title,
      data: { promotionId: promotion.id, partnerId: promotion.partnerId },
      channel: "IN_APP" as const,
      status: "SENT" as const,
      sentAt: now,
      dedupeKey: promotionDedupeKey(promotion.id, userId),
    })));
  if (data.length === 0) return 0;
  const created = await prisma.notification.createMany({ data, skipDuplicates: true });
  return created.count;
};

const activeWhere = (now: Date) => ({ isActive: true, startsAt: { lte: now }, endsAt: { gte: now } });

/** Before a user's notifications are listed: their rows for every active promotion (see the file comment). */
export const ensureActivePromotionRows = async (userId: string, now: Date = new Date()): Promise<number> => {
  const promotions = await prisma.promotion.findMany({ where: activeWhere(now), select: { id: true, partnerId: true, title: true, description: true, discountInfo: true } });
  return addPromotionRows(promotions, [userId], now);
};

/** Admin "dispatch": the promotion's feed rows for these users now (no push). 0 for an unknown promotion. */
export const dispatchPromotion = async (promotionId: string, userIds: string[]): Promise<number> => {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId }, select: { id: true, partnerId: true, title: true, description: true, discountInfo: true } });
  if (!promotion) return 0;
  const created = await addPromotionRows([promotion], userIds);
  // Counts only (no ids, titles or users).
  console.log(JSON.stringify({ event: "promotion_feed_dispatch", users: new Set(userIds).size, created }));
  return created;
};
