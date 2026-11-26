import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import { vnDay } from "./kho-suggest";
import { itemDate } from "./menu.service";
import { lookupMemberships, type MembershipLookup } from "./family-client";

/**
 * Today's breakfast dishes (Vietnam day) of each user's family menu, for notification-service's 07:00 morning push.
 * - The day's own DAY menu wins; otherwise a week / month menu that covers the day (items of that weekday).
 * - Dishes in the same order as Lịch (breakfast dish, one-dish meal, then drinks), names de-duplicated.
 * - Users without a family are left out; a family without a breakfast today gets an empty list.
 * Names only (no ids, amounts or anything personal).
 */
export type BreakfastClient = Pick<PrismaClient, "menu">;
export type BreakfastItem = { userId: string; dishes: string[] };

const ROLE_ORDER = ["sang", "mot_mon", "man", "canh", "rau", "xao", "trang_mieng", "do_uong"];
const roleRank = (details: unknown): number => {
  const role = (details as { role?: unknown } | null)?.role;
  const index = typeof role === "string" ? ROLE_ORDER.indexOf(role) : -1;
  return index < 0 ? ROLE_ORDER.indexOf("trang_mieng") - 0.5 : index;
};

type MenuRow = { familyId: string | null; periodType: string; startDate: Date; items: Array<{ dishName: string; mealType: string; dayOfWeek: number; details: unknown }> };

/** Breakfast dish names for `day` from one family's menus (pure; see the file comment). */
export function breakfastDishes(menus: MenuRow[], day: string): string[] {
  const own = menus.find((menu) => menu.periodType === "DAY" && menu.startDate.toISOString().slice(0, 10) === day);
  const source = own ? [own] : menus.filter((menu) => menu.periodType !== "DAY");
  const items = source.flatMap((menu) => menu.items
    .filter((item) => item.mealType === "BREAKFAST" && itemDate(menu.startDate, item.dayOfWeek).toISOString().slice(0, 10) === day));
  const sorted = [...items].sort((left, right) => roleRank(left.details) - roleRank(right.details) || left.dishName.localeCompare(right.dishName, "vi"));
  return [...new Set(sorted.map((item) => item.dishName.trim()).filter(Boolean))];
}

export async function breakfastToday(userIds: string[], client: BreakfastClient, options: { lookup?: MembershipLookup; now?: Date } = {}): Promise<{ day: string; items: BreakfastItem[] }> {
  const day = vnDay(options.now);
  const memberships = await (options.lookup ?? lookupMemberships)(userIds);
  if (memberships.length === 0) return { day, items: [] };
  const date = new Date(`${day}T00:00:00.000Z`);
  const menus = await client.menu.findMany({
    where: { familyId: { in: [...new Set(memberships.map((membership) => membership.familyId))] }, archived: false, startDate: { lte: date }, endDate: { gte: date } },
    include: { items: true },
  }) as unknown as MenuRow[];
  const byFamily = new Map<string, MenuRow[]>();
  for (const menu of menus) if (menu.familyId) byFamily.set(menu.familyId, [...(byFamily.get(menu.familyId) ?? []), menu]);
  const dishesByFamily = new Map([...byFamily].map(([familyId, rows]) => [familyId, breakfastDishes(rows, day)]));
  return { day, items: memberships.map((membership) => ({ userId: membership.userId, dishes: dishesByFamily.get(membership.familyId) ?? [] })) };
}
