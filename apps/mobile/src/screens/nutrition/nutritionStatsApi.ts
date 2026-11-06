export type DailyNutritionStats = {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  completionPercent: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

export class NutritionStatsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createNutritionStatsApi(baseUrl: string, userId: string) {
  return {
    async getDailyStats(date: string): Promise<DailyNutritionStats> {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/nutrition/daily-stats?date=${encodeURIComponent(date)}`,
        { headers: { "X-User-Id": userId } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new NutritionStatsApiError(
          result.error ?? "Unable to load daily nutrition stats.",
          response.status,
        );
      }
      return result as DailyNutritionStats;
    },
  };
}
