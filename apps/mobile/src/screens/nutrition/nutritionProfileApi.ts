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

export class NutritionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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
