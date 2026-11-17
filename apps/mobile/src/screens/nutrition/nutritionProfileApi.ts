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

function resolveApiBaseUrl(fallbackBaseUrl: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || fallbackBaseUrl;
  return baseUrl.trim().replace(/\/+$/, "");
}

function createAuthHeaders(accessToken: string): Record<string, string> {
  if (!accessToken.trim()) {
    throw new Error("An access token is required for nutrition requests.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    // Avoid the ngrok browser warning page for API calls during development.
    "ngrok-skip-browser-warning": "true",
  };
}

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

// Lightweight JWT payload decoding: no extra library and works in React Native.
// This does NOT verify the token; the server must still verify Authorization.
function readJwtClaims(token: string): Record<string, unknown> | undefined {
  const segments = token.split(".");
  if (segments.length !== 3) return undefined;

  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const encoded = segments[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
  let buffer = 0;
  let bits = 0;
  let jsonBytes = "";

  for (const char of encoded) {
    const value = alphabet.indexOf(char);
    if (value < 0) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      jsonBytes += String.fromCharCode((buffer >> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }

  try {
    const claims: unknown = JSON.parse(jsonBytes);
    return typeof claims === "object" &&
      claims !== null &&
      !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveUserId(accessToken: string, explicitUserId?: string): string {
  const claims = readJwtClaims(accessToken);
  const candidates: unknown[] = [
    explicitUserId,
    claims?.userId,
    claims?.user_id,
    claims?.sub,
    claims?.id,
  ];

  const userId = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && UUID_PATTERN.test(candidate.trim()),
  );

  if (!userId) {
    throw new Error(
      "Cannot determine the user's UUID. Pass the signed-in user's ID as the third argument to createNutritionProfileApi().",
    );
  }
  return userId.trim();
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
    const result: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new NutritionApiError(
        getErrorMessage(result) ?? "Health preference request failed.",
        response.status,
        result,
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
  userId?: string,
) {
  const baseUrl = resolveApiBaseUrl(fallbackBaseUrl);

  async function request(
    method: "GET" | "POST" | "PUT",
    body?: NutritionProfileInput,
  ): Promise<NutritionProfileResult> {
    const headers = {
      ...createAuthHeaders(accessToken),
      "X-User-Id": resolveUserId(accessToken, userId),
    };

    // SCRUM-270: profile API has its own route; do not use /api/nutrition.
    const response = await fetch(`${baseUrl}/api/nutrition-profile`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
    get: () => request("GET"),
    create: (profile: NutritionProfileInput) => request("POST", profile),
    update: (profile: NutritionProfileInput) => request("PUT", profile),
  };
}
