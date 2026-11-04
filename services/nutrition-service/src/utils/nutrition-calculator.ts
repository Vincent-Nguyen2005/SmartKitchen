import type { ActivityLevel, Gender } from "@prisma/client";

export type NutritionMeasurements = {
  height: number;
  weight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
};

const activityMultipliers: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

export function calculateDailyCalories(profile: NutritionMeasurements): {
  bmr: number;
  tdee: number;
} {
  const genderAdjustment = profile.gender === "MALE" ? 5 : -161;
  const bmr =
    10 * profile.weight +
    6.25 * profile.height -
    5 * profile.age +
    genderAdjustment;

  return {
    bmr,
    tdee: bmr * activityMultipliers[profile.activityLevel],
  };
}
