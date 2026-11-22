import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  nutritionProfile: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  allergy: { findMany: vi.fn(), createMany: vi.fn() },
  healthCondition: { findMany: vi.fn(), createMany: vi.fn() },
  userAllergy: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  userHealthCondition: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  userHealthCustom: { findUnique: vi.fn(), upsert: vi.fn() },
  mealLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock(".prisma/client-nutrition", () => {
  class PrismaClientKnownRequestError extends Error { code = ""; }
  return {
    PrismaClient: class {
      nutritionProfile = db.nutritionProfile; allergy = db.allergy; healthCondition = db.healthCondition;
      userAllergy = db.userAllergy; userHealthCondition = db.userHealthCondition; userHealthCustom = db.userHealthCustom; mealLog = db.mealLog;
      $transaction = async (fn: (tx: unknown) => unknown) => fn(this);
    },
    Prisma: { PrismaClientKnownRequestError },
    Gender: { MALE: "MALE", FEMALE: "FEMALE" },
    ActivityLevel: { SEDENTARY: "SEDENTARY", LIGHTLY_ACTIVE: "LIGHTLY_ACTIVE", MODERATELY_ACTIVE: "MODERATELY_ACTIVE", ACTIVE: "ACTIVE", VERY_ACTIVE: "VERY_ACTIVE" },
    MealType: { BREAKFAST: "BREAKFAST", LUNCH: "LUNCH", DINNER: "DINNER", SNACK: "SNACK" },
    MealSource: { HOME: "HOME", EATING_OUT: "EATING_OUT", DELIVERY: "DELIVERY" },
  };
});

import { createApp } from "../src/app";
import { ageFromBirthDate, vnToday } from "../src/utils/age";
import { ALLERGY_CATALOG, CONDITION_CATALOG, seedHealthCatalog } from "../src/seed/health-catalog";
import type { PrismaClient } from ".prisma/client-nutrition";

const USER = "11111111-1111-4111-8111-111111111111";
const base = { height: 170.5, weight: 65.25, gender: "MALE", activityLevel: "LIGHTLY_ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  db.nutritionProfile.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "p1", ...data }));
  db.nutritionProfile.upsert.mockImplementation(async ({ create }: { create: object }) => ({ id: "p1", ...create }));
  db.userAllergy.findMany.mockResolvedValue([]);
  db.userHealthCondition.findMany.mockResolvedValue([]);
  db.userHealthCustom.findUnique.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("birth date and age", () => {
  it("counts full years in Vietnam time", () => {
    expect(ageFromBirthDate("2005-11-25", "2026-11-24")).toBe(20);
    expect(ageFromBirthDate("2005-11-25", "2026-11-25")).toBe(21);
    // 2026-11-24 17:30 UTC is already 25/11 in Vietnam.
    expect(vnToday(new Date("2026-11-24T17:30:00Z"))).toBe("2026-11-25");
  });

  it("stores birthDate and the computed age; returns birthDate as YYYY-MM-DD", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
    const response = await request(createApp()).post("/").set("X-User-Id", USER).send({ ...base, birthDate: "2005-11-25" });
    expect(response.status).toBe(201);
    const data = db.nutritionProfile.create.mock.calls[0][0].data;
    expect(data.age).toBe(21);
    expect(data.birthDate).toEqual(new Date("2005-11-25T00:00:00.000Z"));
    expect(response.body.profile).toMatchObject({ age: 21, birthDate: "2005-11-25", height: 170.5, weight: 65.25 });
  });

  it("rejects future, too old or missing dates; older clients may still send age only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
    const post = (body: object) => request(createApp()).post("/").set("X-User-Id", USER).send({ ...base, ...body });
    expect((await post({ birthDate: "2027-01-01" })).status).toBe(400);
    expect((await post({ birthDate: "1899-12-31" })).status).toBe(400);
    expect((await post({ birthDate: "2026-06-01" })).status).toBe(400); // under 1 year
    expect((await post({})).status).toBe(400);
    expect((await post({ age: 30 })).status).toBe(201);
    expect(db.nutritionProfile.create.mock.calls.at(-1)?.[0].data).not.toHaveProperty("birthDate");
  });

  it("an existing profile with a birth date always shows the current age; one without keeps its stored age", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
    db.nutritionProfile.findUnique.mockResolvedValueOnce({ id: "p1", userId: USER, ...base, age: 20, birthDate: new Date("2005-11-25T00:00:00Z") });
    expect((await request(createApp()).get("/").set("X-User-Id", USER)).body.profile).toMatchObject({ age: 21, birthDate: "2005-11-25" });
    db.nutritionProfile.findUnique.mockResolvedValueOnce({ id: "p1", userId: USER, ...base, age: 40, birthDate: null });
    expect((await request(createApp()).get("/").set("X-User-Id", USER)).body.profile).toMatchObject({ age: 40, birthDate: null });
  });
});

describe("health catalogs", () => {
  it("seed adds only missing names, never updates, and a second run adds nothing", async () => {
    const stored = { allergies: new Set(["Sữa", "Milk"]), conditions: new Set<string>() };
    const insert = (set: Set<string>) => async ({ data, skipDuplicates }: { data: Array<{ name: string }>; skipDuplicates: boolean }) => {
      expect(skipDuplicates).toBe(true);
      let count = 0;
      for (const row of data) if (!set.has(row.name)) { set.add(row.name); count += 1; }
      return { count };
    };
    const client = { allergy: { createMany: insert(stored.allergies) }, healthCondition: { createMany: insert(stored.conditions) } } as unknown as PrismaClient;
    expect(await seedHealthCatalog(client)).toEqual({ allergies: ALLERGY_CATALOG.length - 1, conditions: CONDITION_CATALOG.length });
    expect(await seedHealthCatalog(client)).toEqual({ allergies: 0, conditions: 0 });
    expect(stored.allergies.has("Milk")).toBe(true);
    expect(ALLERGY_CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(CONDITION_CATALOG.length).toBeGreaterThanOrEqual(12);
    // Names the recipe tags use, so the suggestion filter matches them.
    for (const name of ["Sữa", "Trứng", "Cá", "Hải sản", "Đậu nành", "Gluten"]) expect(ALLERGY_CATALOG.map((item) => item.name)).toContain(name);
    for (const name of ["Tiểu đường", "Cao huyết áp", "Mỡ máu cao"]) expect(CONDITION_CATALOG.map((item) => item.name)).toContain(name);
  });
});

describe("custom health tags", () => {
  const SUA = "a1000000-0000-4000-8000-000000000001";
  const DIABETES = "a2000000-0000-4000-8000-000000000001";

  it("stores free text on the profile and turns a typed catalog name into a selection", async () => {
    db.allergy.findMany.mockImplementation(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
      where?.id ? where.id.in.map((id) => ({ id })) : [{ id: SUA, name: "Sữa" }]);
    db.healthCondition.findMany.mockImplementation(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
      where?.id ? where.id.in.map((id) => ({ id })) : [{ id: DIABETES, name: "Tiểu đường" }]);
    db.userHealthCustom.findUnique.mockResolvedValue({ userId: USER, allergies: ["Hạt sen"], conditions: ["Viêm xoang"] });

    const response = await request(createApp()).post("/user/profile/health").set("X-User-Id", USER).send({
      allergyIds: [],
      conditionIds: [DIABETES],
      customAllergies: ["Hạt sen", "sua", " hạt sen "],
      customConditions: ["Viêm xoang"],
    });
    expect(response.status).toBe(200);
    // "sua" matched the catalog item "Sữa" (no accents, any case); duplicates are dropped.
    expect(db.userAllergy.createMany).toHaveBeenCalledWith({ data: [{ userId: USER, allergyId: SUA }] });
    expect(db.userHealthCustom.upsert).toHaveBeenCalledWith({
      where: { userId: USER },
      create: { userId: USER, allergies: ["Hạt sen"], conditions: ["Viêm xoang"] },
      update: { allergies: ["Hạt sen"], conditions: ["Viêm xoang"] },
    });
    expect(response.body).toMatchObject({ customAllergies: ["Hạt sen"], customConditions: ["Viêm xoang"] });
  });

  it("older clients without custom fields leave the stored custom tags untouched", async () => {
    db.allergy.findMany.mockResolvedValue([{ id: SUA }]);
    db.healthCondition.findMany.mockResolvedValue([]);
    const response = await request(createApp()).post("/user/profile/health").set("X-User-Id", USER).send({ allergyIds: [SUA], conditionIds: [] });
    expect(response.status).toBe(200);
    expect(db.userHealthCustom.upsert).not.toHaveBeenCalled();
  });
});
