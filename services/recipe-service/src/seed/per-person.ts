import { Prisma, type PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { seedRecipes, type SeedRecipe } from "./recipes.data";

/**
 * Starter-dish ingredients eaten one per person (menus scale them per person). Keyed by dish name; values are the
 * ingredient names in that dish. Only obvious cases: bread, fried eggs, drinks and single fruits or yoghurt.
 */
export const PER_PERSON: Record<string, string[]> = {
  "Bánh mì trứng ốp la": ["Bánh mì", "Trứng gà"],
  "Bánh mì chảo": ["Bánh mì", "Trứng gà"],
  "Bò kho": ["Bánh mì"],
  "Nước cam": ["Cam"],
  "Sinh tố chuối": ["Chuối", "Sữa tươi"],
  "Sữa chua": ["Sữa chua"],
  "Chuối tráng miệng": ["Chuối"],
  "Cam tráng miệng": ["Cam"],
  "Sữa tươi nóng": ["Sữa tươi"],
  "Nước chanh": ["Chanh"],
  "Bánh mì sandwich trứng": ["Bánh mì sandwich", "Trứng gà"],
};

type StoredIngredient = Record<string, unknown> & { name?: unknown; perPerson?: unknown };
const key = (value: string): string => value.normalize("NFC").trim().toLocaleLowerCase("vi");

/**
 * Startup data step: sets perPerson = true on the listed starter-dish ingredients where the flag is still UNSET.
 * The admin form always saves the flag (true or false), so admin-edited rows are never changed; running it again
 * changes nothing. Returns the number of recipes updated.
 */
export async function fillPerPerson(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes, table: Record<string, string[]> = PER_PERSON): Promise<number> {
  const starters = new Set(recipes.map((recipe) => key(recipe.name)));
  const wanted = new Map(Object.entries(table).map(([dish, names]) => [key(dish), new Set(names.map(key))]));
  const rows = await client.recipe.findMany({ select: { id: true, name: true, ingredientDetails: true } });
  let updated = 0;
  for (const row of rows) {
    const names = wanted.get(key(row.name));
    if (!names || !starters.has(key(row.name)) || !Array.isArray(row.ingredientDetails)) continue;
    let changed = false;
    const details = (row.ingredientDetails as StoredIngredient[]).map((entry) => {
      if (typeof entry?.name !== "string" || !names.has(key(entry.name)) || entry.perPerson !== undefined) return entry;
      changed = true;
      return { ...entry, perPerson: true };
    });
    if (!changed) continue;
    await client.recipe.update({ where: { id: row.id }, data: { ingredientDetails: details as unknown as Prisma.InputJsonValue } });
    updated += 1;
  }
  return updated;
}
