import assert from "node:assert/strict";
import test from "node:test";
import { PeriodType, PrismaClient } from "../../node_modules/.prisma/client-menu";
import { runFamilyBackfill } from "../services/family-backfill";
import type { FamilyMembership } from "../services/family-client";
import { resolveMenuOwner } from "../controllers/menu.controller";
import {
  canEditMenuSettings,
  generateMenu,
  getMenuSettings,
  listMenus,
  MenuServiceError,
  recentlyRemoved,
  updateMenuSettings,
} from "../services/menu.service";

const FAMILY = "f1";
const DAY = new Date("2026-11-24T00:00:00.000Z");

type MenuRow = { id: string; userId: string; familyId: string | null; archived: boolean; startDate: Date; endDate?: Date; periodType: PeriodType; updatedAt: Date; servings?: number | null; items?: unknown[] };
type Where = Record<string, unknown>;

/** Field equality for the simple where clauses used here ({ in } and plain values). */
const matches = (row: Record<string, unknown>, where: Where = {}): boolean => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === "object" && !(value instanceof Date) && "in" in (value as Where)) return ((value as { in: unknown[] }).in).includes(row[key]);
  if (value && typeof value === "object" && !(value instanceof Date) && "gte" in (value as Where)) return (row[key] as Date) >= ((value as { gte: Date }).gte);
  if (value instanceof Date) return row[key] instanceof Date && (row[key] as Date).getTime() === value.getTime();
  return row[key] === value;
});

/** In-memory menu store with the partial unique index: one active menu per family, day and period. */
function memoryClient(seed: { menus?: MenuRow[]; removed?: Array<{ userId: string; familyId: string | null; recipeId: string | null; dishName: string; removedAt: Date }>; settings?: Array<{ userId: string; breakfast: number; lunch: number; dinner: number; updatedAt: Date }>; familySettings?: Array<{ familyId: string; breakfast: number; lunch: number; dinner: number }> } = {}) {
  const store = {
    menus: [...(seed.menus ?? [])],
    removed: [...(seed.removed ?? [])],
    settings: [...(seed.settings ?? [])],
    familySettings: [...(seed.familySettings ?? [])],
  };
  let nextId = 1;
  const menu = {
    findMany: async ({ where, orderBy }: { where?: Where; orderBy?: { updatedAt?: string } } = {}) => {
      const rows = store.menus.filter((row) => matches(row, where));
      return orderBy?.updatedAt === "desc" ? [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) : rows;
    },
    findFirst: async ({ where }: { where: Where }) => store.menus.find((row) => matches(row, where)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<MenuRow> }) => {
      const row = store.menus.find((entry) => entry.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = store.menus.length;
      store.menus = store.menus.filter((row) => !matches(row, where));
      return { count: before - store.menus.length };
    },
    create: async ({ data }: { data: MenuRow & { items: { create: unknown[] } } }) => {
      // Yield first, so two concurrent generations interleave like separate transactions.
      await new Promise((resolve) => setImmediate(resolve));
      if (data.familyId && store.menus.some((row) => row.familyId === data.familyId && !row.archived && row.periodType === data.periodType && row.startDate.getTime() === data.startDate.getTime())) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      const row = { ...data, id: `m${nextId++}`, archived: false, updatedAt: new Date(), items: data.items.create };
      store.menus.push(row);
      return row;
    },
  };
  const removedDish = {
    findMany: async ({ where, distinct }: { where?: Where; distinct?: string[] } = {}) => {
      const rows = store.removed.filter((row) => matches(row, where));
      return distinct ? [...new Map(rows.map((row) => [row.userId, row])).values()] : rows;
    },
    updateMany: async ({ where, data }: { where: Where; data: { familyId: string } }) => {
      const rows = store.removed.filter((row) => matches(row, where));
      rows.forEach((row) => { row.familyId = data.familyId; });
      return { count: rows.length };
    },
  };
  const menuSettings = {
    findMany: async () => store.settings,
    findUnique: async ({ where }: { where: { userId: string } }) => store.settings.find((row) => row.userId === where.userId) ?? null,
  };
  const familyMenuSettings = {
    findMany: async () => store.familySettings,
    findUnique: async ({ where }: { where: { familyId: string } }) => store.familySettings.find((row) => row.familyId === where.familyId) ?? null,
    upsert: async ({ where, create, update }: { where: { familyId: string }; create: (typeof store.familySettings)[number]; update: object }) => {
      const row = store.familySettings.find((entry) => entry.familyId === where.familyId);
      if (row) { Object.assign(row, update); return row; }
      store.familySettings.push(create);
      return create;
    },
    createMany: async ({ data }: { data: typeof store.familySettings }) => {
      const fresh = data.filter((row) => !store.familySettings.some((entry) => entry.familyId === row.familyId));
      store.familySettings.push(...fresh);
      return { count: fresh.length };
    },
  };
  const client = { menu, removedDish, menuSettings, familyMenuSettings, $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ menu }) } as unknown as PrismaClient;
  return { client, store };
}

const memberships: FamilyMembership[] = [
  { userId: "owner", familyId: FAMILY, role: "OWNER", memberCount: 2 },
  { userId: "member", familyId: FAMILY, role: "MEMBER", memberCount: 2 },
];
const lookup = async (ids: string[]) => memberships.filter((entry) => ids.includes(entry.userId));

test("backfill: same family and day -> the latest menu stays active, the others are archived; personal menus stay", async () => {
  const { client, store } = memoryClient({
    menus: [
      { id: "old", userId: "owner", familyId: null, archived: false, startDate: DAY, periodType: PeriodType.DAY, updatedAt: new Date("2026-11-24T01:00:00Z") },
      { id: "new", userId: "member", familyId: null, archived: false, startDate: DAY, periodType: PeriodType.DAY, updatedAt: new Date("2026-11-24T05:00:00Z") },
      // Already carried the family (Kho) and is older than "new": archived too.
      { id: "kho", userId: "owner", familyId: FAMILY, archived: false, startDate: DAY, periodType: PeriodType.DAY, updatedAt: new Date("2026-11-24T03:00:00Z") },
      { id: "other-day", userId: "owner", familyId: null, archived: false, startDate: new Date("2026-11-25T00:00:00Z"), periodType: PeriodType.DAY, updatedAt: new Date("2026-11-24T02:00:00Z") },
      { id: "solo", userId: "loner", familyId: null, archived: false, startDate: DAY, periodType: PeriodType.DAY, updatedAt: new Date("2026-11-24T04:00:00Z") },
    ],
    removed: [
      { userId: "owner", familyId: null, recipeId: "r1", dishName: "Canh chua", removedAt: new Date() },
      { userId: "member", familyId: null, recipeId: "r2", dishName: "Cá kho", removedAt: new Date() },
      { userId: "loner", familyId: null, recipeId: "r3", dishName: "Phở", removedAt: new Date() },
    ],
    settings: [
      { userId: "owner", breakfast: 2, lunch: 4, dinner: 4, updatedAt: new Date("2026-11-01T00:00:00Z") },
      { userId: "member", breakfast: 6, lunch: 6, dinner: 6, updatedAt: new Date("2026-11-20T00:00:00Z") },
    ],
  });

  const first = await runFamilyBackfill(client, lookup);
  const byId = (id: string) => store.menus.find((row) => row.id === id)!;
  assert.equal(byId("new").archived, false);
  assert.equal(byId("new").familyId, FAMILY);
  assert.equal(byId("old").archived, true);
  assert.equal(byId("old").familyId, FAMILY);
  assert.equal(byId("kho").archived, true);
  assert.equal(byId("other-day").archived, false);
  assert.equal(byId("solo").familyId, null);
  assert.equal(store.menus.length, 5, "nothing is deleted");
  // updatedAt is kept, so the ordering stays true on later runs.
  assert.equal(byId("old").updatedAt.toISOString(), "2026-11-24T01:00:00.000Z");
  assert.deepEqual(first, { menusAssigned: 3, menusArchived: 2, removedDishesAssigned: 2, familySettingsCreated: 1 });
  // The owner's settings win over a more recent member setting.
  assert.deepEqual(store.familySettings, [{ familyId: FAMILY, breakfast: 2, lunch: 4, dinner: 4 }]);
  // Dislike history is merged for the family; the loner keeps a personal row.
  const merged = await recentlyRemoved({ userId: "member", familyId: FAMILY }, client);
  assert.deepEqual([...merged.recipeIds].sort(), ["r1", "r2"]);
  assert.deepEqual([...(await recentlyRemoved("loner", client)).recipeIds], ["r3"]);

  // Idempotent: a second run changes nothing.
  assert.deepEqual(await runFamilyBackfill(client, lookup), { menusAssigned: 0, menusArchived: 0, removedDishesAssigned: 0, familySettingsCreated: 0 });
});

test("membership: the caller's family is used; another familyId is refused; no family means personal; lookup down is 503", async () => {
  assert.deepEqual(await resolveMenuOwner("member", undefined, lookup), { userId: "member", familyId: FAMILY, role: "MEMBER", memberCount: 2 });
  assert.deepEqual(await resolveMenuOwner("member", FAMILY, lookup), { userId: "member", familyId: FAMILY, role: "MEMBER", memberCount: 2 });
  await assert.rejects(resolveMenuOwner("member", "f-other", lookup), (error: unknown) => error instanceof MenuServiceError && error.statusCode === 403);
  await assert.rejects(resolveMenuOwner("loner", FAMILY, lookup), (error: unknown) => error instanceof MenuServiceError && error.statusCode === 403);
  assert.deepEqual(await resolveMenuOwner("loner", undefined, lookup), { userId: "loner", familyId: null });
  await assert.rejects(resolveMenuOwner("member", undefined, async () => { throw new Error("down"); }),
    (error: unknown) => error instanceof MenuServiceError && error.statusCode === 503);
});

test("settings: everyone reads the family value; only the OWNER changes it; personal users change their own", async () => {
  const { client, store } = memoryClient({ familySettings: [{ familyId: FAMILY, breakfast: 2, lunch: 4, dinner: 4 }] });
  const member = { userId: "member", familyId: FAMILY, role: "MEMBER" };
  const owner = { userId: "owner", familyId: FAMILY, role: "OWNER" };
  assert.deepEqual(await getMenuSettings(member, client), { BREAKFAST: 2, LUNCH: 4, DINNER: 4 });
  assert.equal(canEditMenuSettings(member), false);
  assert.equal(canEditMenuSettings(owner), true);
  assert.equal(canEditMenuSettings("loner"), true);
  await assert.rejects(updateMenuSettings(member, { breakfast: 1, lunch: 1, dinner: 1 }, client),
    (error: unknown) => error instanceof MenuServiceError && error.statusCode === 403);
  assert.deepEqual(await updateMenuSettings(owner, { breakfast: 3, lunch: 3, dinner: 3 }, client), { BREAKFAST: 3, LUNCH: 3, DINNER: 3 });
  assert.deepEqual(store.familySettings, [{ familyId: FAMILY, breakfast: 3, lunch: 3, dinner: 3 }]);
});

const recipes = [
  { id: "b", name: "Cháo", ingredients: ["gạo"], mealTypes: ["breakfast"], calories: 300 },
  { id: "l", name: "Cơm gà", ingredients: ["gà"], mealTypes: ["lunch"], calories: 550 },
  { id: "d", name: "Cá kho", ingredients: ["cá"], mealTypes: ["dinner"], calories: 500 },
];

test("concurrent generation by two members leaves one family menu (the unique key decides, no duplicates)", async () => {
  const { client, store } = memoryClient();
  const input = (userId: string) => ({
    userId, owner: { userId, familyId: FAMILY, role: "MEMBER", memberCount: 3 },
    periodType: PeriodType.DAY, startDate: DAY, endDate: DAY, recipes, inventoryItems: [],
  });
  const [a, b] = await Promise.all([generateMenu(input("owner"), client), generateMenu(input("member"), client)]);
  const active = store.menus.filter((row) => row.familyId === FAMILY && !row.archived);
  assert.equal(active.length, 1);
  assert.equal((a as { id: string }).id, active[0].id);
  assert.equal((b as { id: string }).id, active[0].id);
  assert.equal(active[0].servings, 3);

  // "Làm mới theo kho" by the other member replaces the family's menu (still one).
  await generateMenu(input("member"), client);
  assert.equal(store.menus.filter((row) => row.familyId === FAMILY && !row.archived).length, 1);
});

test("without a family: personal menus by userId, as before", async () => {
  const { client, store } = memoryClient({
    menus: [{ id: "p1", userId: "loner", familyId: null, archived: false, startDate: DAY, endDate: DAY, periodType: PeriodType.DAY, updatedAt: new Date() }],
    settings: [{ userId: "loner", breakfast: 1, lunch: 2, dinner: 3, updatedAt: new Date() }],
  });
  const personal = await resolveMenuOwner("loner", undefined, lookup);
  assert.equal((await listMenus(personal, client)).length, 1);
  assert.deepEqual(await getMenuSettings(personal, client), { BREAKFAST: 1, LUNCH: 2, DINNER: 3 });
  const created = await generateMenu({ userId: "loner", owner: personal, periodType: PeriodType.DAY, startDate: DAY, endDate: DAY, recipes, inventoryItems: [] }, client) as MenuRow;
  assert.equal(created.familyId, null);
  assert.equal(created.servings, 1);
  // The new menu replaced the personal one for that day.
  assert.deepEqual(store.menus.map((row) => row.userId), ["loner"]);
});
