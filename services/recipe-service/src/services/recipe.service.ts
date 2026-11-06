import { PrismaClient } from "../../node_modules/.prisma/client-recipe";

const prisma = new PrismaClient();

export function listActiveRecipes() {
  return prisma.recipe.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}
