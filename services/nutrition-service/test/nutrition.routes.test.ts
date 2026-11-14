import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dedicated Prisma client: no database is needed for these route tests.
const db = vi.hoisted(() => ({
  nutritionProfile: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  allergy: { findMany: vi.fn() },
  healthCondition: { findMany: vi.fn() },
  userAllergy: { findMany: vi.fn() },
  userHealthCondition: { findMany: vi.fn() },
  mealLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock(".prisma/client-nutrition", () => {
  class PrismaClientKnownRequestError extends Error { code = ""; }
  return {
    PrismaClient: class {
      nutritionProfile = db.nutritionProfile; allergy = db.allergy; healthCondition = db.healthCondition;
      userAllergy = db.userAllergy; userHealthCondition = db.userHealthCondition; mealLog = db.mealLog;
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

const USER = "11111111-1111-4111-8111-111111111111";
const profile = { id: "p1", userId: USER, height: 170, weight: 65, age: 30, gender: "MALE", activityLevel: "SEDENTARY" };
const savedEnv = { meal: process.env.MEAL_DIARY_SERVICE_URL };

beforeEach(() => {
  vi.clearAllMocks();
  db.nutritionProfile.findUnique.mockResolvedValue(profile);
  db.allergy.findMany.mockResolvedValue([{ id: "a1", name: "Đậu phộng" }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv.meal === undefined) delete process.env.MEAL_DIARY_SERVICE_URL; else process.env.MEAL_DIARY_SERVICE_URL = savedEnv.meal;
});

describe("nutrition profile (main's behaviour kept)", () => {
  it("still answers on /api/nutrition-profile and, for the gateway, on /", async () => {
    for (const path of ["/api/nutrition-profile", "/"]) {
      expect((await request(createApp()).get(path)).status).toBe(401);
      const response = await request(createApp()).get(path).set("X-User-Id", USER);
      expect(response.status).toBe(200);
      expect(response.body.profile.userId).toBe(USER);
      expect(typeof response.body.tdee).toBe("number");
    }
    db.nutritionProfile.findUnique.mockResolvedValue(null);
    expect((await request(createApp()).get("/").set("X-User-Id", USER)).status).toBe(404);
  });

  it("serves the restored health catalogue endpoints", async () => {
    const response = await request(createApp()).get("/allergies");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: "a1", name: "Đậu phộng" }]);
  });
});

describe("daily stats and suggestions (restored)", () => {
  it("validates the caller and the date on both mounts", async () => {
    for (const path of ["/api/nutrition/daily-stats?date=2026-11-14", "/daily-stats?date=2026-11-14"]) {
      expect((await request(createApp()).get(path)).status).toBe(401);
    }
    expect((await request(createApp()).get("/daily-stats?date=14-11-2026").set("X-User-Id", USER)).status).toBe(400);
    expect((await request(createApp()).get("/suggestions?x=1").set("X-User-Id", USER)).status).toBe(400);
  });

  it("combines the profile with meal-diary's daily summary", async () => {
    process.env.MEAL_DIARY_SERVICE_URL = "http://meal-diary-service:4005";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ date: "2026-11-14", totalCalories: 1000, totalProtein: 50, totalCarbs: 120, totalFat: 30 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(createApp()).get("/daily-stats?date=2026-11-14").set("X-User-Id", USER);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://meal-diary-service:4005/api/meal-diary/daily-summary?date=2026-11-14");
    expect(response.body).toMatchObject({ date: "2026-11-14", totalCalories: 1000 });
    expect(response.body.targets.calories).toBeGreaterThan(0);
  });

  it("answers 502 when the meal-diary URL is not configured", async () => {
    delete process.env.MEAL_DIARY_SERVICE_URL;
    const response = await request(createApp()).get("/daily-stats?date=2026-11-14").set("X-User-Id", USER);
    expect(response.status).toBe(502);
  });
});
