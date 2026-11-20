import { gatewayFetch } from "../../services/api";

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

// Shared gateway transport: base URL, ngrok header and Bearer token (the gateway sets the user from it).
export function createNutritionStatsApi(accessToken: string | null) {
  return {
    async getDailyStats(date: string): Promise<DailyNutritionStats> {
      const response = await gatewayFetch(`/api/nutrition/daily-stats?date=${encodeURIComponent(date)}`, { accessToken });
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
