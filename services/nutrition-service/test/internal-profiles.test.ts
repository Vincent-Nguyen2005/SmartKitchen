import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  nutritionProfile: { findMany: vi.fn() },
  userAllergy: { findMany: vi.fn() },
  userHealthCondition: { findMany: vi.fn() },
  userHealthCustom: { findMany: vi.fn() },
}));
vi.mock(".prisma/client-nutrition", () => ({
  PrismaClient: class {
    nutritionProfile = db.nutritionProfile; userAllergy = db.userAllergy;
    userHealthCondition = db.userHealthCondition; userHealthCustom = db.userHealthCustom;
  },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  Gender: { MALE: "MALE", FEMALE: "FEMALE" },
  ActivityLevel: { SEDENTARY: "SEDENTARY", LIGHTLY_ACTIVE: "LIGHTLY_ACTIVE", MODERATELY_ACTIVE: "MODERATELY_ACTIVE", ACTIVE: "ACTIVE", VERY_ACTIVE: "VERY_ACTIVE" },
  MealType: { BREAKFAST: "BREAKFAST", LUNCH: "LUNCH", DINNER: "DINNER", SNACK: "SNACK" },
  MealSource: { HOME: "HOME", EATING_OUT: "EATING_OUT", DELIVERY: "DELIVERY" },
}));

import { createApp } from "../src/app";

const KEY = "test-internal-key-with-more-than-32-characters";
const WITH_PROFILE = "11111111-1111-4111-8111-111111111111";
const WITHOUT_PROFILE = "22222222-2222-4222-8222-222222222222";
let oldKey: string | undefined;

beforeAll(() => { oldKey = process.env.INTERNAL_API_KEY; process.env.INTERNAL_API_KEY = KEY; });
afterAll(() => { process.env.INTERNAL_API_KEY = oldKey; });
beforeEach(() => {
  vi.clearAllMocks();
  db.nutritionProfile.findMany.mockResolvedValue([
    { userId: WITH_PROFILE, height: 164, weight: 50, age: 21, birthDate: null, gender: "MALE", activityLevel: "LIGHTLY_ACTIVE" },
  ]);
  db.userAllergy.findMany.mockResolvedValue([{ userId: WITH_PROFILE, allergy: { name: "Tôm" } }]);
  db.userHealthCondition.findMany.mockResolvedValue([{ userId: WITH_PROFILE, condition: { name: "Tiểu đường" } }]);
  db.userHealthCustom.findMany.mockResolvedValue([{ userId: WITH_PROFILE, allergies: ["hạt điều"], conditions: [] }]);
});

describe("POST /internal/profiles", () => {
  it("rejects calls without the internal key, or with a wrong one", async () => {
    expect((await request(createApp()).post("/internal/profiles").send({ userIds: [WITH_PROFILE] })).status).toBe(403);
    expect((await request(createApp()).post("/internal/profiles").set("x-api-key", "wrong").send({ userIds: [WITH_PROFILE] })).status).toBe(403);
    expect(db.nutritionProfile.findMany).not.toHaveBeenCalled();
  });

  it("is unavailable when the key is not configured", async () => {
    process.env.INTERNAL_API_KEY = "";
    const response = await request(createApp()).post("/internal/profiles").set("x-api-key", KEY).send({ userIds: [WITH_PROFILE] });
    process.env.INTERNAL_API_KEY = KEY;
    expect(response.status).toBe(503);
  });

  it("validates userIds (1-20 UUIDs)", async () => {
    const app = createApp();
    expect((await request(app).post("/internal/profiles").set("x-api-key", KEY).send({ userIds: [] })).status).toBe(400);
    expect((await request(app).post("/internal/profiles").set("x-api-key", KEY).send({ userIds: ["nope"] })).status).toBe(400);
    const many = Array.from({ length: 21 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect((await request(app).post("/internal/profiles").set("x-api-key", KEY).send({ userIds: many })).status).toBe(400);
  });

  it("returns targets and health tags per user, defaults without a profile, no names", async () => {
    const response = await request(createApp()).post("/internal/profiles").set("x-api-key", KEY)
      .send({ userIds: [WITH_PROFILE, WITHOUT_PROFILE, WITH_PROFILE] });
    expect(response.status).toBe(200);
    const [member, other] = response.body.items;
    expect(response.body.items).toHaveLength(2);
    expect(member).toMatchObject({
      userId: WITH_PROFILE, hasProfile: true, sex: "MALE", age: 21, tdee: 1959,
      macros: { protein: 98, carbs: 269.4, fat: 54.4 },
      allergies: ["Tôm", "hạt điều"], conditions: ["Tiểu đường"],
    });
    expect(member.mealTargets.lunch.calories).toBe(784);
    expect(other).toMatchObject({ userId: WITHOUT_PROFILE, hasProfile: false, sex: null, age: null, tdee: 2000, allergies: [], conditions: [] });
    expect(other.mealTargets).toMatchObject({ breakfast: { calories: 500 }, lunch: { calories: 800 }, dinner: { calories: 700 } });
    expect(JSON.stringify(response.body)).not.toMatch(/name|email/i);
  });
});
