import type { PrismaClient } from "../../node_modules/.prisma/client-admin";
import { catalogSeed, type CatalogSeed } from "./catalog.data";

/** Same normalisation as the ingredient routes (search key). */
const normalize = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Startup data step: adds the starter catalog ingredients whose name is missing. Existing rows are never updated or
 * deleted (admin edits stay), so running it again changes nothing. Returns the number of rows added.
 */
export async function seedMissingIngredients(client: PrismaClient, seed: CatalogSeed[] = catalogSeed): Promise<number> {
  const existing = new Set((await client.masterIngredient.findMany({ select: { name: true } })).map((row) => normalize(row.name)));
  const missing = seed.filter((entry) => !existing.has(normalize(entry.name)));
  if (missing.length === 0) return 0;
  const created = await client.masterIngredient.createMany({
    data: missing.map((entry) => ({
      name: entry.name,
      nameNormalized: normalize(entry.name),
      category: entry.group,
      defaultUnit: entry.unit,
      shelfLifeDays: entry.shelfLifeDays,
      caloriesPer100g: entry.kcal,
      allergenTags: [],
    })),
    skipDuplicates: true,
  });
  return created.count;
}
