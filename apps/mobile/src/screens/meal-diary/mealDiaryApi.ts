export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type MealSource = "HOME" | "EATING_OUT" | "DELIVERY";

export type MealLogItem = {
  id: string;
  mealLogId: string;
  foodName: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  quantity: number;
};

export type MealLog = {
  id: string;
  userId: string;
  mealType: MealType;
  source: MealSource;
  loggedAt: string;
  createdAt: string;
  items: MealLogItem[];
};

export type DailyMealSummary = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealHistory = {
  meals: MealLog[];
  dailySummary: DailyMealSummary[];
};

export type MealLogInput = {
  mealType: MealType;
  source: MealSource;
  loggedAt?: string;
  items: {
    foodName: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    quantity: number;
  }[];
};

export class MealDiaryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createMealDiaryApi(baseUrl: string, userId: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/nutrition-profile${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
          ...init.headers,
        },
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MealDiaryApiError(
        result.error ?? "Meal diary request failed.",
        response.status,
      );
    }
    return result as T;
  }

  return {
    getHistory: (date: string) =>
      request<MealHistory>(`/meals/history?date=${encodeURIComponent(date)}`),
    logMeal: (meal: MealLogInput) =>
      request<MealLog>("/meals/log", {
        method: "POST",
        body: JSON.stringify(meal),
      }),
    getCalorieGoal: async (): Promise<number | null> => {
      try {
        const result = await request<{ tdee?: number }>("/");
        return typeof result.tdee === "number" && Number.isFinite(result.tdee)
          ? result.tdee
          : null;
      } catch (error) {
        if (error instanceof MealDiaryApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
  };
}
