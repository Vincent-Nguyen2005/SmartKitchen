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

export function createSuggestionsApi(baseUrl: string, userId: string) {
  return {
    async get(): Promise<PersonalizedSuggestions> {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/nutrition/suggestions`,
        { headers: { "X-User-Id": userId } },
      );
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
