import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import type { FamilyMembership, MembershipLookup } from "./family-client";

/**
 * Family menus backfill: an idempotent data step run at startup (after `prisma migrate deploy`). It only touches rows
 * that still have no family, so running it again changes nothing. Logs counts only.
 *
 * 1. Menus without a family whose creator is now in a family get that familyId. Per family, day and period only one
 *    menu stays active: the most recently updated one; the others are archived (kept readable, never deleted).
 *    updatedAt is kept as it was, so "latest wins" stays true across runs.
 * 2. Dislike history (RemovedDish) without a family gets the creator's family, so members' removals are merged.
 * 3. FamilyMenuSettings for families that have none: copied from the OWNER's personal settings, else from the most
 *    recently updated member setting. Families without any setting keep the defaults (3 / 5 / 5).
 * Users without a family keep their personal menus, history and settings unchanged.
 */
export type BackfillResult = {
  menusAssigned: number;
  menusArchived: number;
  removedDishesAssigned: number;
  familySettingsCreated: number;
};

export async function runFamilyBackfill(client: PrismaClient, lookup: MembershipLookup): Promise<BackfillResult> {
  const result: BackfillResult = { menusAssigned: 0, menusArchived: 0, removedDishesAssigned: 0, familySettingsCreated: 0 };
  const [menus, removedRows, settings, existingFamilySettings] = await Promise.all([
    client.menu.findMany({
      where: { familyId: null, archived: false },
      select: { id: true, userId: true, startDate: true, periodType: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    client.removedDish.findMany({ where: { familyId: null }, select: { userId: true }, distinct: ["userId"] }),
    client.menuSettings.findMany(),
    client.familyMenuSettings.findMany({ select: { familyId: true } }),
  ]);
  const userIds = [...new Set([...menus.map((menu) => menu.userId), ...removedRows.map((row) => row.userId), ...settings.map((row) => row.userId)])];
  if (userIds.length === 0) return result;
  const memberships = new Map<string, FamilyMembership>((await lookup(userIds)).map((membership) => [membership.userId, membership]));

  // 1. Menus: newest first, so the first one placed in a family/day/period is normally the one that stays active.
  for (const menu of menus) {
    const membership = memberships.get(menu.userId);
    if (!membership) continue;
    await client.$transaction(async (tx) => {
      const active = await tx.menu.findFirst({
        where: { familyId: membership.familyId, startDate: menu.startDate, periodType: menu.periodType, archived: false },
        select: { id: true, updatedAt: true },
      });
      const keepThis = !active || menu.updatedAt > active.updatedAt;
      if (active && keepThis) {
        await tx.menu.update({ where: { id: active.id }, data: { archived: true, updatedAt: active.updatedAt } });
        result.menusArchived += 1;
      }
      await tx.menu.update({ where: { id: menu.id }, data: { familyId: membership.familyId, archived: !keepThis, updatedAt: menu.updatedAt } });
      result.menusAssigned += 1;
      if (!keepThis) result.menusArchived += 1;
    });
  }

  // 2. Dislike history: one update per family for its members' rows that have no family yet.
  const usersByFamily = new Map<string, string[]>();
  for (const { userId } of removedRows) {
    const membership = memberships.get(userId);
    if (membership) usersByFamily.set(membership.familyId, [...(usersByFamily.get(membership.familyId) ?? []), userId]);
  }
  for (const [familyId, members] of usersByFamily) {
    const updated = await client.removedDish.updateMany({ where: { familyId: null, userId: { in: members } }, data: { familyId } });
    result.removedDishesAssigned += updated.count;
  }

  // 3. Family settings from the owner's personal settings, else the most recent member setting.
  const hasSettings = new Set(existingFamilySettings.map((row) => row.familyId));
  const chosen = new Map<string, { row: (typeof settings)[number]; owner: boolean }>();
  for (const row of settings) {
    const membership = memberships.get(row.userId);
    if (!membership || hasSettings.has(membership.familyId)) continue;
    const owner = membership.role === "OWNER";
    const current = chosen.get(membership.familyId);
    if (!current || (owner && !current.owner) || (owner === current.owner && row.updatedAt > current.row.updatedAt)) {
      chosen.set(membership.familyId, { row, owner });
    }
  }
  if (chosen.size > 0) {
    const created = await client.familyMenuSettings.createMany({
      data: [...chosen].map(([familyId, { row }]) => ({ familyId, breakfast: row.breakfast, lunch: row.lunch, dinner: row.dinner })),
      skipDuplicates: true,
    });
    result.familySettingsCreated = created.count;
  }
  return result;
}

/** Startup wrapper: never blocks or crashes the service; logs counts (or why it was skipped). */
export async function runFamilyBackfillAtStartup(client: PrismaClient, lookup: MembershipLookup): Promise<void> {
  if (!process.env.INTERNAL_API_KEY) {
    console.warn("[menu-service] family backfill skipped: INTERNAL_API_KEY is not configured");
    return;
  }
  try {
    const result = await runFamilyBackfill(client, lookup);
    console.log(`[menu-service] family backfill: ${result.menusAssigned} menus assigned to families, ${result.menusArchived} archived, `
      + `${result.removedDishesAssigned} removed dishes merged, ${result.familySettingsCreated} family settings created`);
  } catch (error) {
    // Retried at the next start; requests keep working (menus without a family stay readable by their creator).
    console.error("[menu-service] family backfill failed (will retry at next start):", error instanceof Error ? error.message : "unknown error");
  }
}
