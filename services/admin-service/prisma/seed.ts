import { PrismaClient } from "../node_modules/.prisma/client-admin";
import { seedMissingIngredients } from "../src/seed/seed-catalog";

const prisma = new PrismaClient();
const weights = [{ key: "expiry_priority", value: 0.35 }, { key: "nutrition_fit", value: 0.35 }, { key: "preference_match", value: 0.3 }];

// Same starter catalog as the startup step (src/seed/catalog.data.ts: real groups, unit codes and kcal per 100 g).
// Only missing names are added; existing rows (admin edits) are never overwritten.
async function main(): Promise<void> {
  console.log(`added ${await seedMissingIngredients(prisma)} starter catalog ingredients`);
  for (const weight of weights) await prisma.recommendationWeight.upsert({ where: { key: weight.key }, update: {}, create: { ...weight, updatedBy: "seed" } });
}
main().finally(() => prisma.$disconnect());
