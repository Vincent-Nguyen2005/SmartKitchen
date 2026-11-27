/**
 * Refresh pacing for Thông báo (pure; covered by liveRefresh.test.ts).
 * - Tab badge: tab switches and returning to the app refresh it at most every BADGE_MIN_INTERVAL_MS; a real change
 *   (the feed reloaded, items deleted / read) refreshes it at once (`force`).
 * - 429 after the transport's one retry: the screen keeps what it shows, shows a small notice instead of the red
 *   error screen, and tries again once after RATE_LIMIT_RELOAD_MS.
 */
export const BADGE_MIN_INTERVAL_MS = 15_000;
export const RATE_LIMIT_RELOAD_MS = 5_000;
export const RATE_LIMIT_NOTICE = "Máy chủ đang bận, đang hiển thị dữ liệu gần nhất. Sẽ tự tải lại.";

export const shouldRefreshBadge = (lastAt: number | null, now: number, force = false): boolean =>
  force || lastAt === null || now - lastAt >= BADGE_MIN_INTERVAL_MS;

/** A request failed with 429 (also after the transport's retry). */
export const isRateLimited = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { status?: unknown }).status === 429;
