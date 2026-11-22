import { describe, expect, it } from "vitest";
import type { PrismaClient } from ".prisma/client-nutrition";
import { ENGLISH_ALLERGIES, ENGLISH_CONDITIONS, removeEnglishCatalog } from "../src/seed/english-catalog-cleanup";
import { ALLERGY_CATALOG, CONDITION_CATALOG } from "../src/seed/health-catalog";

type Row = { id: string; name: string };
type Selection = { userId: string; itemId: string };

/** In-memory catalogs, selections and custom tags: enough Prisma for the cleanup step. */
function memory(initial: { allergies: Row[]; conditions: Row[]; userAllergies: Selection[]; userConditions: Selection[]; custom?: Record<string, { allergies: string[]; conditions: string[] }> }) {
  const state = { ...initial, custom: initial.custom ?? {} };
  const catalog = (rows: Row[]) => ({
    findUnique: async ({ where }: { where: { name: string } }) => rows.find((row) => row.name === where.name) ?? null,
    delete: async ({ where }: { where: { id: string } }) => { rows.splice(rows.findIndex((row) => row.id === where.id), 1); return {}; },
  });
  const selections = (list: Selection[], field: "allergyId" | "conditionId") => ({
    findMany: async ({ where }: { where: Record<string, string> }) => list.filter((row) => row.itemId === where[field]).map((row) => ({ userId: row.userId, [field]: row.itemId })),
    createMany: async ({ data, skipDuplicates }: { data: Array<Record<string, string>>; skipDuplicates: boolean }) => {
      expect(skipDuplicates).toBe(true);
      let count = 0;
      for (const row of data) {
        if (list.some((existing) => existing.userId === row.userId && existing.itemId === row[field])) continue;
        list.push({ userId: row.userId, itemId: row[field] });
        count += 1;
      }
      return { count };
    },
    deleteMany: async ({ where }: { where: Record<string, string> }) => {
      const before = list.length;
      for (let index = list.length - 1; index >= 0; index -= 1) if (list[index].itemId === where[field]) list.splice(index, 1);
      return { count: before - list.length };
    },
  });
  const client = {
    allergy: catalog(state.allergies),
    healthCondition: catalog(state.conditions),
    userAllergy: selections(state.userAllergies, "allergyId"),
    userHealthCondition: selections(state.userConditions, "conditionId"),
    userHealthCustom: {
      findUnique: async ({ where }: { where: { userId: string } }) => (state.custom[where.userId] ? { userId: where.userId, ...state.custom[where.userId] } : null),
      upsert: async ({ where, create, update }: { where: { userId: string }; create: { allergies: string[]; conditions: string[] }; update: Partial<{ allergies: string[]; conditions: string[] }> }) => {
        state.custom[where.userId] = state.custom[where.userId] ? { ...state.custom[where.userId], ...update } : { allergies: create.allergies, conditions: create.conditions };
        return {};
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(client),
  };
  return { client: client as unknown as PrismaClient, state };
}

const english = (rows: Array<{ from: string }>, prefix: string): Row[] => rows.map((row, index) => ({ id: `${prefix}-en-${index}`, name: row.from }));

describe("removing the old English catalog entries", () => {
  it("moves selections to the Vietnamese entry (skipping users who have it), deletes the English entries, and is idempotent", async () => {
    const enAllergies = english(ENGLISH_ALLERGIES, "a");
    const enConditions = english(ENGLISH_CONDITIONS, "c");
    const milk = enAllergies.find((row) => row.name === "Milk")!;
    const diabetes = enConditions.find((row) => row.name === "Diabetes")!;
    const { client, state } = memory({
      allergies: [...enAllergies, { id: "vi-sua", name: "Sữa" }, { id: "vi-trung", name: "Trứng" }],
      conditions: [...enConditions, { id: "vi-td", name: "Tiểu đường" }, { id: "vi-cha", name: "Cao huyết áp" }],
      userAllergies: [
        { userId: "u1", itemId: milk.id },
        { userId: "u2", itemId: milk.id }, { userId: "u2", itemId: "vi-sua" }, // u2 already has Sữa
      ],
      userConditions: [{ userId: "u1", itemId: diabetes.id }],
    });

    const first = await removeEnglishCatalog(client);
    expect(first.deleted).toBe(11);
    expect(first.moved).toBe(2); // u1 Sữa, u1 Tiểu đường (u2 skipped)
    expect(state.allergies.map((row) => row.name).sort()).toEqual(["Sữa", "Trứng"]);
    expect(state.conditions.map((row) => row.name).sort()).toEqual(["Cao huyết áp", "Tiểu đường"]);
    expect(state.userAllergies).toEqual(expect.arrayContaining([{ userId: "u1", itemId: "vi-sua" }, { userId: "u2", itemId: "vi-sua" }]));
    expect(state.userAllergies).toHaveLength(2);
    expect(state.userConditions).toEqual([{ userId: "u1", itemId: "vi-td" }]);

    const snapshot = JSON.stringify(state);
    expect(await removeEnglishCatalog(client)).toEqual({ moved: 0, toCustom: 0, deleted: 0 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("an English entry without its Vietnamese equivalent becomes the user's custom tag (nothing lost)", async () => {
    const { client, state } = memory({
      // "Shellfish" exists, but "Hải sản" is not in this catalog -> custom tag "Hải sản có vỏ".
      allergies: [{ id: "en-shell", name: "Shellfish" }],
      conditions: [],
      userAllergies: [{ userId: "u1", itemId: "en-shell" }, { userId: "u2", itemId: "en-shell" }],
      userConditions: [],
      custom: { u2: { allergies: ["Hải sản có vỏ"], conditions: ["Viêm xoang"] } },
    });
    const report = await removeEnglishCatalog(client);
    expect(report).toEqual({ moved: 0, toCustom: 2, deleted: 1 });
    expect(state.allergies).toEqual([]);
    expect(state.custom.u1).toEqual({ allergies: ["Hải sản có vỏ"], conditions: [] });
    expect(state.custom.u2).toEqual({ allergies: ["Hải sản có vỏ"], conditions: ["Viêm xoang"] }); // no duplicate
  });

  it("the seed never recreates the English names", () => {
    const seeded = [...ALLERGY_CATALOG, ...CONDITION_CATALOG].map((item) => item.name);
    for (const { from } of [...ENGLISH_ALLERGIES, ...ENGLISH_CONDITIONS]) expect(seeded).not.toContain(from);
    // Every mapped Vietnamese name exists in the seed, so the remap target is always there after seeding.
    for (const { to } of ENGLISH_ALLERGIES) expect(ALLERGY_CATALOG.map((item) => item.name)).toContain(to);
    for (const { to } of ENGLISH_CONDITIONS) expect(CONDITION_CATALOG.map((item) => item.name)).toContain(to);
  });
});
