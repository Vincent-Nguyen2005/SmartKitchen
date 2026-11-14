import { PrismaClient } from "../node_modules/.prisma/client-recipe/index.js";

const prisma = new PrismaClient();

const recipes = [
  {
    name: "Lemon herb roast chicken",
    description: "Golden roast chicken with lemon, garlic, and fragrant garden herbs.",
    ingredients: [
      "Chicken thighs (800 g)",
      "Lemon (1 whole)",
      "Garlic (4 cloves, crushed)",
      "Rosemary (2 sprigs)",
      "Olive oil (2 tbsp)",
    ],
    mealTypes: ["dinner"],
    dietaryTags: ["high protein", "gluten free"],
    tags: ["family favorite"],
    preparationMinutes: 70,
    servings: 4,
  },
  {
    name: "Tomato basil pasta",
    description: "A bright weeknight pasta with sweet tomatoes and fresh basil.",
    ingredients: [
      "Pasta (200 g)",
      "Cherry tomatoes (250 g)",
      "Fresh basil (1 handful)",
      "Parmesan (30 g, finely grated)",
    ],
    mealTypes: ["dinner"],
    dietaryTags: ["vegetarian"],
    tags: ["quick", "family favorite"],
    preparationMinutes: 30,
    servings: 2,
  },
  {
    name: "Green garden omelette",
    description: "Soft eggs folded around spinach, herbs, and a little sharp cheese.",
    ingredients: [
      "Eggs (2 large)",
      "Baby spinach (1 cup)",
      "Cheddar (25 g, grated)",
      "Chives (1 tbsp, chopped)",
    ],
    mealTypes: ["breakfast"],
    dietaryTags: ["vegetarian", "high protein"],
    tags: ["quick"],
    preparationMinutes: 16,
    servings: 1,
  },
];

async function main(): Promise<void> {
  for (const recipe of recipes) {
    const existing = await prisma.recipe.findFirst({
      where: { name: recipe.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.recipe.update({ where: { id: existing.id }, data: recipe });
    } else {
      await prisma.recipe.create({ data: recipe });
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed recipes", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
