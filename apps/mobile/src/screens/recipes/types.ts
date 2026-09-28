export type RecipeIngredient = {
    name: string;
    quantity: string;
    unit?: string;
    notes?: string;
};

export type Recipe = {
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    categories: string[];
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    servings: number;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    ingredients: RecipeIngredient[];
    steps: string[];
};