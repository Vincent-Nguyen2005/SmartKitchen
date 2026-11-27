/**
 * Quản trị › "Tổng quan" (pure; covered by overviewStats.test.ts): one card with three selectable cells — Người dùng,
 * Gia đình, Mới (7 ngày) — and one searchable list below for the selected cell. (System status, services with a
 * problem and pending reports were removed from the overview; the "Xem tất cả" screens were replaced by this list.)
 */
import { normalizeVi } from "../../services/localSearch";

export const NEW_USER_DAYS = 7;
const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

export type OverviewCardKey = "users" | "families" | "newUsers";
/** The overview card's cells, left to right: short labels (one line each) and a spoken name for screen readers. */
export const OVERVIEW_CARDS: ReadonlyArray<{ key: OverviewCardKey; label: string; spoken: string }> = [
  { key: "users", label: "Người dùng", spoken: "Tổng người dùng" },
  { key: "families", label: "Gia đình", spoken: "Tổng gia đình" },
  { key: "newUsers", label: `Mới (${NEW_USER_DAYS} ngày)`, spoken: `Người dùng mới trong ${NEW_USER_DAYS} ngày` },
];

const isCardKey = (value: unknown): value is OverviewCardKey => OVERVIEW_CARDS.some((card) => card.key === value);
/** The selected cell, remembered while the admin session lasts (default Người dùng). */
let lastCard: OverviewCardKey = "users";
export const overviewCardMemory = {
  get: (): OverviewCardKey => lastCard,
  set: (value: unknown): OverviewCardKey => { lastCard = isCardKey(value) ? value : "users"; return lastCard; },
};

/** Start (UTC ms) of the first Vietnam day of the last NEW_USER_DAYS days: today and the 6 days before (like Doanh thu "7 ngày"). */
export function newUsersSince(now: number): number {
  const vnToday = Math.floor((now + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  return vnToday - (NEW_USER_DAYS - 1) * DAY_MS - VN_OFFSET_MS;
}
export const isNewUser = (createdAt: string, now: number): boolean => {
  const time = Date.parse(createdAt);
  return !Number.isNaN(time) && time >= newUsersSince(now) && time <= now + 60_000;
};

const newestFirst = <T extends { createdAt: string }>(items: readonly T[]): T[] =>
  [...items].sort((first, second) => (Date.parse(second.createdAt) || 0) - (Date.parse(first.createdAt) || 0));

/** Search placeholder per cell. */
export const searchPlaceholder = (card: OverviewCardKey): string => (card === "families" ? "Tìm tên gia đình" : "Tìm tên hoặc email");

type UserLike = { name: string | null; email: string; createdAt: string };
type FamilyLike = { name: string; createdAt: string };

/** The list under the card: all users / all families / users new in the last 7 Vietnam days, newest first, searched on the device. */
export function overviewList<U extends UserLike, F extends FamilyLike>(card: OverviewCardKey, users: readonly U[], families: readonly F[], search: string, now: number):
  { kind: "users"; items: U[] } | { kind: "families"; items: F[] } {
  const term = normalizeVi(search.trim());
  if (card === "families") {
    return { kind: "families", items: newestFirst(families).filter((family) => !term || normalizeVi(family.name).includes(term)) };
  }
  const base = card === "newUsers" ? users.filter((user) => isNewUser(user.createdAt, now)) : users;
  return { kind: "users", items: newestFirst(base).filter((user) => !term || normalizeVi(user.name ?? "").includes(term) || normalizeVi(user.email).includes(term)) };
}

/** The three numbers. */
export const overviewCounts = (users: readonly UserLike[], families: readonly FamilyLike[], now: number): Record<OverviewCardKey, number> => ({
  users: users.length, families: families.length, newUsers: users.filter((user) => isNewUser(user.createdAt, now)).length,
});

/** Empty list text per cell (searching → "Không tìm thấy …"). */
export function overviewEmptyText(card: OverviewCardKey, searching: boolean): string {
  if (card === "families") return searching ? "Không tìm thấy gia đình" : "Chưa có gia đình";
  if (searching) return "Không tìm thấy người dùng";
  return card === "newUsers" ? `Không có người dùng mới trong ${NEW_USER_DAYS} ngày` : "Chưa có người dùng";
}
