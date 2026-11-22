import { gatewayFetch } from "../../services/api";

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type MealSource = "HOME" | "EATING_OUT" | "DELIVERY";

/** Matches meal-diary-service MealDiaryItem. */
export type MealLogItem = {
  id: string;
  mealDiaryId: string;
  foodName: string;
  unit: string;
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
  /** Calendar day of the meal (the API returns YYYY-MM-DDT00:00:00.000Z). */
  date: string;
  loggedAt: string;
  notes: string | null;
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
  /** Selected calendar day, YYYY-MM-DD (Vietnam time); the service files the meal under this day. */
  date: string;
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
    unit?: string;
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

// Shared gateway transport: base URL, ngrok header and Bearer token (the gateway sets the user from it).
export function createMealDiaryApi(accessToken: string | null) {
  async function request<T>(path: string, init: { method?: string; body?: string } = {}): Promise<T> {
    const response = await gatewayFetch(`/api/meal-diary${path}`, { ...init, accessToken });
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
    /** Removes one logged meal (Dinh dưỡng trong ngày › "Bỏ"). */
    deleteMeal: (id: string) => request<unknown>(`/meals/${encodeURIComponent(id)}`, { method: "DELETE" }),
    getHistory: (date: string) =>
      request<MealHistory>(`/meals/history?date=${encodeURIComponent(date)}`),
    logMeal: (meal: MealLogInput) =>
      request<MealLog>("/meals/log", {
        method: "POST",
        body: JSON.stringify({
          ...meal,
          items: meal.items.map((item) => ({
            ...item,
            unit: item.unit ?? "serving",
          })),
        }),
      }),
  };
}
