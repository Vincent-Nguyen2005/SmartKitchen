/**
 * Quản trị › "Tổng quan" numbers (pure; covered by overviewStats.test.ts): one card with three columns — Người dùng,
 * Gia đình, Mới (7 ngày) — then the newest users and families. (System status, services with a problem and
 * pending reports were removed from the overview.)
 */
export const NEW_USER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OverviewCardKey = "users" | "families" | "newUsers";
/** The overview card's columns, left to right: short labels (one line each) and a spoken name for screen readers. */
export const OVERVIEW_CARDS: ReadonlyArray<{ key: OverviewCardKey; label: string; spoken: string }> = [
  { key: "users", label: "Người dùng", spoken: "Tổng người dùng" },
  { key: "families", label: "Gia đình", spoken: "Tổng gia đình" },
  { key: "newUsers", label: `Mới (${NEW_USER_DAYS} ngày)`, spoken: `Người dùng mới trong ${NEW_USER_DAYS} ngày` },
];

/**
 * New users in the last NEW_USER_DAYS from the newest page (auth-service has no "created after" filter). When every
 * row of the page is recent and there are more users, the true number is higher: "100+".
 */
export function countNewUsers(page: { items: Array<{ createdAt: string }>; total: number }, now: number): string {
  const since = now - NEW_USER_DAYS * DAY_MS;
  const recent = page.items.filter((user) => new Date(user.createdAt).getTime() >= since).length;
  return recent === page.items.length && page.total > page.items.length ? `${recent}+` : String(recent);
}
