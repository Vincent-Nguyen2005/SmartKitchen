import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the dedicated Prisma client: no database is needed for these route tests.
const db = vi.hoisted(() => ({
  mealDiary: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock(".prisma/client-meal-diary", () => ({
  PrismaClient: class { mealDiary = db.mealDiary; },
  MealType: { BREAKFAST: "BREAKFAST", LUNCH: "LUNCH", DINNER: "DINNER", SNACK: "SNACK" },
  MealSource: { HOME: "HOME", EATING_OUT: "EATING_OUT", DELIVERY: "DELIVERY" },
}));

import { createApp } from "../src/app";

const USER = "11111111-1111-4111-8111-111111111111";
const meal = { date: "2026-11-14", mealType: "LUNCH", source: "HOME", items: [{ foodName: "Cơm gà", calories: 600, protein: 30, quantity: 1 }] };

beforeEach(() => {
  vi.clearAllMocks();
  db.mealDiary.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data }));
  db.mealDiary.findMany.mockResolvedValue([
    { id: "m1", items: [{ calories: 600, protein: 30, carbs: 50, fat: 20, quantity: 1 }, { calories: 100, protein: null, carbs: 20, fat: null, quantity: 2 }] },
  ]);
  db.mealDiary.deleteMany.mockResolvedValue({ count: 1 });
});

describe("meal-diary routes", () => {
  it("serves /health", async () => {
    expect((await request(createApp()).get("/health")).status).toBe(200);
  });

  it("requires a valid X-User-Id on both mounts", async () => {
    for (const path of ["/api/meal-diary/meals/history?date=2026-11-14", "/meals/history?date=2026-11-14"]) {
      expect((await request(createApp()).get(path)).status).toBe(401);
      expect((await request(createApp()).get(path).set("X-User-Id", "not-a-uuid")).status).toBe(401);
    }
  });

  it("logs a meal for the caller and rejects an invalid body", async () => {
    const created = await request(createApp()).post("/api/meal-diary/meals/log").set("X-User-Id", USER).send(meal);
    expect(created.status).toBe(201);
    expect(db.mealDiary.create.mock.calls[0][0].data).toMatchObject({ userId: USER, mealType: "LUNCH", source: "HOME" });
    expect((await request(createApp()).post("/meals/log").set("X-User-Id", USER).send({ ...meal, items: [] })).status).toBe(400);
  });

  it("returns the daily summary nutrition-service reads (gateway-stripped path works too)", async () => {
    for (const path of ["/api/meal-diary/daily-summary?date=2026-11-14", "/daily-summary?date=2026-11-14"]) {
      const response = await request(createApp()).get(path).set("X-User-Id", USER);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ date: "2026-11-14", totalCalories: 800, totalProtein: 30, totalCarbs: 90, totalFat: 20 });
    }
    expect((await request(createApp()).get("/daily-summary?date=2026-02-30").set("X-User-Id", USER)).status).toBe(400);
  });

  it("deletes only the caller's meal (404 when not found)", async () => {
    expect((await request(createApp()).delete("/meals/22222222-2222-4222-8222-222222222222").set("X-User-Id", USER)).status).toBe(204);
    expect(db.mealDiary.deleteMany).toHaveBeenCalledWith({ where: { id: "22222222-2222-4222-8222-222222222222", userId: USER } });
    db.mealDiary.deleteMany.mockResolvedValue({ count: 0 });
    expect((await request(createApp()).delete("/meals/22222222-2222-4222-8222-222222222222").set("X-User-Id", USER)).status).toBe(404);
  });
});
