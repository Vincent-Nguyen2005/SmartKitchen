import Constants from "expo-constants";
export type Gender = "MALE" | "FEMALE";
export type ActivityLevel =
  | "SEDENTARY"
  | "LIGHTLY_ACTIVE"
  | "MODERATELY_ACTIVE"
  | "ACTIVE"
  | "VERY_ACTIVE";

type NutritionProfileMeasurements =
  | { age: number; birthYear?: never }
  | { age?: never; birthYear: number };

export type NutritionProfileInput = {
  height: number;
  weight: number;
  gender: Gender;
  activityLevel: ActivityLevel;
} & NutritionProfileMeasurements;

export type NutritionProfileResult = {
  profile: Omit<NutritionProfileInput, "age" | "birthYear"> & {
    age?: number;
    birthYear?: number;
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
    readonly responseData?: unknown,
  ) {
    super(message);
    this.name = "NutritionApiError";
  }
}

declare const process: {
  env?: Record<string, string | undefined>;
};

function resolveApiBaseUrl(fallbackBaseUrl: string): string {
  const envUrl =
    typeof process !== "undefined"
      ? process.env?.EXPO_PUBLIC_API_BASE_URL
      : undefined;
  const baseUrl = envUrl || fallbackBaseUrl;
  return baseUrl.replace(/\/$/, "");
}
function createAuthHeaders(accessToken: string): Record<string, string> {
  if (!accessToken.trim()) {
    throw new Error("An access token is required for nutrition requests.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export function createHealthPreferencesApi(
  fallbackBaseUrl: string,
  accessToken: string,
) {
  const baseUrl = resolveApiBaseUrl(fallbackBaseUrl);
  const headers = createAuthHeaders(accessToken);

  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}/api/nutrition${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

export function createNutritionProfileApi(
  fallbackBaseUrl: string,
  accessToken: string,
) {
  const baseUrl = resolveApiBaseUrl(fallbackBaseUrl);
  const headers = createAuthHeaders(accessToken);

  function getErrorMessage(result: unknown): string | undefined {
    if (typeof result === "string" && result.trim()) return result;
    if (typeof result !== "object" || result === null) return undefined;

    if ("error" in result && typeof result.error === "string") {
      return result.error;
    }
    if ("message" in result && typeof result.message === "string") {
      return result.message;
    }
    return undefined;
  }

  async function request(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: NutritionProfileInput,
  ) {
    const response = await fetch(`${baseUrl}/api/nutrition${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const responseText = await response.text();
    let result: unknown;
    if (responseText) {
      try {
        result = JSON.parse(responseText) as unknown;
      } catch {
        result = responseText;
      }
    }
    if (!response.ok) {
      throw new NutritionApiError(
        getErrorMessage(result) ?? "Nutrition request failed.",
        response.status,
        result,
      );
    }
    if (result === undefined) {
      throw new NutritionApiError(
        "The server returned an invalid response.",
        response.status,
        result,
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
