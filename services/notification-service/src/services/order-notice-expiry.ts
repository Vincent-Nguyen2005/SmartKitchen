import type { Prisma } from ".prisma/client-notification";

/**
 * Finished order notices leave Thông báo by themselves: the one row per order (dedupeKey "order:<orderId>") whose
 * latest status is DELIVERED, FAILED or CANCELLED disappears 72 hours (exactly, so the same in every time zone,
 * Asia/Ho_Chi_Minh included) after that status was set. The status time is the row's createdAt: every status change
 * resets it (internal.route.ts, replace). PENDING / SHIPPING notices stay. Orders themselves (Đơn hàng, Chi tiêu)
 * live in shopping-list-service and are never touched.
 *
 * No job needed: GET /notifications (the feed and the bell badge) leaves expired rows out and deletes the caller's
 * expired rows during that read (idempotent). If a finished order ever changed status again, the normal upsert would
 * simply make or update its row.
 */
export const FINISHED_ORDER_STATUSES = ["DELIVERED", "FAILED", "CANCELLED"] as const;
export const ORDER_NOTICE_TTL_MS = 72 * 3_600_000;

export const orderNoticeCutoff = (now: Date = new Date()): Date => new Date(now.getTime() - ORDER_NOTICE_TTL_MS);

/** Rows that are expired finished order notices (status time 72 h ago or earlier). */
export const expiredOrderNoticeWhere = (cutoff: Date): Prisma.NotificationWhereInput => ({
  // `not: null` keeps the condition FALSE (not NULL) for rows without a key, so NOT(...) never drops them.
  dedupeKey: { not: null, startsWith: "order:" },
  createdAt: { lte: cutoff },
  OR: FINISHED_ORDER_STATUSES.map((status) => ({ data: { path: ["status"], equals: status } })),
});

/** The same rule in code (tests, and anything that already holds rows). */
export const isExpiredOrderNotice = (row: { dedupeKey: string | null; createdAt: Date; data: unknown }, now: Date = new Date()): boolean => {
  const status = (row.data as { status?: unknown } | null)?.status;
  return Boolean(row.dedupeKey?.startsWith("order:"))
    && (FINISHED_ORDER_STATUSES as readonly unknown[]).includes(status)
    && row.createdAt.getTime() <= orderNoticeCutoff(now).getTime();
};
