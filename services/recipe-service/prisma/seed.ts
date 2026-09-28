import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const recipes = [
  {
    slug: "lemon-herb-roast-chicken",
    title: "Lemon herb roast chicken",
    description: "Golden roast chicken with lemon, garlic, and fragrant garden herbs.",
    prepTimeMinutes: 15,
    cookTimeMinutes: 55,
    servings: 4,
    difficulty: "EASY" as const,
    categories: ["Dinner", "High protein"],
    tags: ["Family favorite", "Gluten free"],
    ingredients: [
      { name: "Chicken thighs", quantity: "800", unit: "g" },
      { name: "Lemon", quantity: "1", unit: "whole" },
      { name: "Garlic", quantity: "4", unit: "cloves", notes: "Crushed" },
      { name: "Rosemary", quantity: "2", unit: "sprigs" },
      { name: "Olive oil", quantity: "2", unit: "tbsp" },
    ],
    steps: [
      "Heat the oven to 200 C and pat the chicken dry.",
      "Toss chicken with lemon, garlic, rosemary, olive oil, salt, and pepper.",
      "Roast until golden and cooked through, about 50 to 55 minutes.",
    ],
  },
  {
    slug: "tomato-basil-pasta",
    title: "Tomato basil pasta",
    description: "A bright weeknight pasta with sweet tomatoes and fresh basil.",
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    difficulty: "EASY" as const,
    categories: ["Dinner", "Vegetarian"],
    tags: ["Quick", "Family favorite"],
    ingredients: [
      { name: "Pasta", quantity: "200", unit: "g" },
      { name: "Cherry tomatoes", quantity: "250", unit: "g" },
      { name: "Fresh basil", quantity: "1", unit: "handful" },
      { name: "Parmesan", quantity: "30", unit: "g", notes: "Finely grated" },
    ],
    steps: [
      "Cook the pasta in salted boiling water until just tender.",
      "Warm the tomatoes in olive oil until they begin to burst.",
      "Toss pasta with tomatoes and basil, then finish with Parmesan.",
    ],
  },
  {
    slug: "green-garden-omelette",
    title: "Green garden omelette",
    description: "Soft eggs folded around spinach, herbs, and a little sharp cheese.",
    prepTimeMinutes: 8,
    cookTimeMinutes: 8,
    servings: 1,
    difficulty: "EASY" as const,
    categories: ["Breakfast", "Vegetarian"],
    tags: ["Quick", "High protein"],
    ingredients: [
      { name: "Eggs", quantity: "2", unit: "large" },
      { name: "Baby spinach", quantity: "1", unit: "cup" },
      { name: "Cheddar", quantity: "25", unit: "g", notes: "Grated" },
      { name: "Chives", quantity: "1", unit: "tbsp", notes: "Chopped" },
    ],
    steps: [
      "Whisk the eggs with a pinch of salt and pepper.",
      "Wilt spinach in a warm non-stick pan, then add the eggs.",
      "Scatter over cheese and chives, fold, and serve while soft.",
    ],
  },
];

const slugify = (value: string): string =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main(): Promise<void> {
  for (const recipe of recipes) {
    const { categories, tags, ingredients, steps, ...recipeData } = recipe;
    await prisma.recipe.upsert({
      where: { slug: recipe.slug },
      update: {},
      create: {
        ...recipeData,
        ingredients: {
          create: ingredients.map(({ name, ...details }) => ({
            ...details,
            ingredient: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
        steps: { create: steps.map((instruction, index) => ({ instruction, position: index + 1 })) },
        categories: {
          connectOrCreate: categories.map((name) => ({ where: { name }, create: { name, slug: slugify(name) } })),
        },
        tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name, slug: slugify(name) } })) },
      },
    });
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