import { PrismaClient } from "../node_modules/.prisma/client-recipe/index.js";
import { seedMissingRecipes } from "../src/seed/seed-recipes";

// `pnpm --filter recipe-service prisma:seed`: adds starter recipes that are missing (by name), never overwrites.
// The container also seeds automatically at start when the Recipe table is empty (src/index.ts).
const prisma = new PrismaClient();

seedMissingRecipes(prisma)
  .then((created) => console.log(`[recipe-service] seeded ${created} recipe(s)`))
  .catch((error: unknown) => {
    console.error("Failed to seed recipes", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
