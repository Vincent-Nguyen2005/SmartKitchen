import { describe, expect, it } from "vitest";
import {
  averageMealTargets,
  DEFAULT_DAILY_CALORIES,
  dailyTargets,
  mealTargets,
  targetsFromCalories,
  tdeeOf,
} from "../src/utils/targets";

const male = { height: 164, weight: 50, age: 21, gender: "MALE", activityLevel: "LIGHTLY_ACTIVE" } as const;
const female = { ...male, gender: "FEMALE" } as const;

describe("shared targets", () => {
  it("uses Mifflin-St Jeor x 1.375 (worked example: 21 y, 50 kg, 164 cm)", () => {
    // BMR male = 10*50 + 6.25*164 - 5*21 + 5 = 1425; x 1.375 = 1959.4
    expect(Math.round(tdeeOf(male))).toBe(1959);
    // BMR female = 1425 - 166 = 1259; x 1.375 = 1731.1
    expect(Math.round(tdeeOf(female))).toBe(1731);
  });

  it("splits macros 20 / 55 / 25", () => {
    expect(targetsFromCalories(2000)).toEqual({ calories: 2000, protein: 100, carbs: 275, fat: 55.6 });
    expect(dailyTargets(male)).toEqual({ calories: 1959, protein: 98, carbs: 269.4, fat: 54.4 });
  });

  it("splits meals 25 / 40 / 35", () => {
    const meals = mealTargets(null);
    expect(meals.breakfast.calories).toBe(500);
    expect(meals.lunch.calories).toBe(800);
    expect(meals.dinner.calories).toBe(700);
    expect(meals.lunch).toEqual({ calories: 800, protein: 40, carbs: 110, fat: 22.2 });
  });

  it("uses 2000 kcal without a profile", () => {
    expect(tdeeOf(null)).toBe(DEFAULT_DAILY_CALORIES);
    expect(dailyTargets(null).calories).toBe(2000);
    expect(averageMealTargets(null).calories).toBe(667);
  });
});
