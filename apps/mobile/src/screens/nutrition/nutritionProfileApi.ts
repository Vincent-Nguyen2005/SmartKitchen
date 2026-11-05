export type Gender = "MALE" | "FEMALE";
export type ActivityLevel =
  | "SEDENTARY"
  | "LIGHTLY_ACTIVE"
  | "MODERATELY_ACTIVE"
  | "ACTIVE"
  | "VERY_ACTIVE";

export type NutritionProfileInput = {
  height: number;
  weight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
};

export type NutritionProfileResult = {
  profile: NutritionProfileInput & {
    id: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
  };
  bmr: number;
  tdee: number;
};

export type HealthOption = {
  id: string;
  name: string;
  description: string | null;
};

export type HealthSelection = {
  allergies: HealthOption[];
  healthConditions: HealthOption[];
};

export class NutritionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createHealthPreferencesApi(baseUrl: string, userId: string) {
  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/nutrition-profile${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new NutritionApiError(
        result.error ?? "Health preference request failed.",
        response.status,
      );
    }
    return result as T;
  }

  return {
    getAllergies: () => request<HealthOption[]>("/allergies"),
    getConditions: () => request<HealthOption[]>("/health-conditions"),
    getSelection: () => request<HealthSelection>("/user/profile/health"),
    saveSelection: (allergyIds: string[], conditionIds: string[]) =>
      request<HealthSelection>("/user/profile/health", "POST", {
        allergyIds,
        conditionIds,
      }),
  };
}

export function createNutritionProfileApi(baseUrl: string, userId: string) {
  async function request(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: NutritionProfileInput,
  ) {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/nutrition-profile${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new NutritionApiError(
        result.error ?? "Nutrition request failed.",
        response.status,
      );
    }
    return result as NutritionProfileResult;
  }

  return {
    get: () => request("", "GET"),
    create: (profile: NutritionProfileInput) => request("", "POST", profile),
    update: (profile: NutritionProfileInput) => request("", "PUT", profile),
  };
}
