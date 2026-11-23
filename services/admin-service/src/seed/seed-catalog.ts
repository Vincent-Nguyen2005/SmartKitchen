import type { PrismaClient } from "../../node_modules/.prisma/client-admin";
import { catalogSeed, type CatalogSeed } from "./catalog.data";

/** Same normalisation as the ingredient routes (search key). */
const normalize = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Names an admin removed from the catalog: deleted for good (DELETE audit row) or renamed (UPDATE audit row whose
 * name changed). Audit rows keep the old row under metadata.before and the new one under metadata.after.
 */
const removedNames = async (client: PrismaClient): Promise<string[]> => {
  const rows = await client.auditLog.findMany({ where: { targetType: "MasterIngredient", action: { in: ["DELETE", "UPDATE"] } }, select: { action: true, metadata: true } });
  return rows.flatMap((row) => {
    const metadata = row.metadata as { before?: { name?: unknown }; after?: { name?: unknown } } | null;
    const before = metadata?.before?.name;
    if (typeof before !== "string") return [];
    if (row.action === "UPDATE" && (typeof metadata?.after?.name !== "string" || normalize(metadata.after.name) === normalize(before))) return [];
    return [normalize(before)];
  });
};

/**
 * Startup data step: adds the starter catalog ingredients whose name is missing. Existing rows are never updated or
 * deleted (admin edits stay), and a starter ingredient an admin deleted or renamed is not created again, so running
 * it again changes nothing. Returns the number of rows added.
 */
export async function seedMissingIngredients(client: PrismaClient, seed: CatalogSeed[] = catalogSeed): Promise<number> {
  const existing = new Set((await client.masterIngredient.findMany({ select: { name: true } })).map((row) => normalize(row.name)));
  for (const name of await removedNames(client)) existing.add(name);
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
