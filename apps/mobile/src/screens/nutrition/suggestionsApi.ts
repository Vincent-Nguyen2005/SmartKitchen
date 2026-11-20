import { gatewayFetch } from "../../services/api";

export type RecipeSuggestion = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ingredients: string[];
  allergens: string[];
  contraindications: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isActive: boolean;
  nutritionScore: number;
};

export type PersonalizedSuggestions = {
  targetPerMeal: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  excludedAllergens: string[];
  excludedHealthConditions: string[];
  suggestions: RecipeSuggestion[];
};

export class SuggestionsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Shared gateway transport: base URL, ngrok header and Bearer token (the gateway sets the user from it).
export function createSuggestionsApi(accessToken: string | null) {
  return {
    async get(): Promise<PersonalizedSuggestions> {
      const response = await gatewayFetch("/api/nutrition/suggestions", { accessToken });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new SuggestionsApiError(
          result.error ?? "Unable to load recipe suggestions.",
          response.status,
        );
      }
      return result as PersonalizedSuggestions;
    },
  };
}
