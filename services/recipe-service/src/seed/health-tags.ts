import type { PrismaClient } from "../../node_modules/.prisma/client-recipe";
import { seedRecipes, seedRole, type SeedRecipe } from "./recipes.data";

/**
 * Health tags for the starter dishes, used by menu-service's family rules (allergy exclusion, condition warnings).
 * Values are the nutrition-service catalog names (allergies: Tôm, Cua, Mực, Hải sản, Cá, Trứng, Sữa, Đậu phộng,
 * Đậu nành, Gluten, Mè; conditions: Tiểu đường, Cao huyết áp, Gout, Mỡ máu cao).
 *
 * Words are matched whole, lower case WITH accents ("cá" is not "cà", "mì" is not "mì chính").
 *
 * Allergens (from ingredient names, seasonings included):
 *   tôm / cua / mực → that seafood + Hải sản; hải sản, nghêu, sò, hến, ốc → Hải sản; cá → Cá; trứng → Trứng;
 *   sữa (not "sữa đậu nành") → Sữa; đậu phộng, lạc → Đậu phộng; đậu nành, đậu phụ, đậu hũ, nước tương, xì dầu → Đậu nành;
 *   gluten, lúa mì, bột mì, bánh mì, mì, bột chiên → Gluten; mè, vừng → Mè.
 *   (Nước mắm is not tagged as Cá: it is in almost every dish and would empty the menu of a fish-allergic family.)
 * Contraindications (simple, conservative):
 *   Tiểu đường: chè, "chua ngọt", sweet drinks (drinks with sugar), desserts with sugar, condensed milk or coconut cream.
 *   Cao huyết áp: kho, rim, mắm (as a dish), dưa muối, cà pháo; processed meats (lạp xưởng, xúc xích, pa tê).
 *   Gout: organ meats (lòng, gan, cật, tim, tiết, dồi, pa tê); seafood (tôm, cua, mực, hải sản); rich beef / bone broth
 *   dishes (phở bò, bún bò, bò kho, bò hầm; xương, giò heo).
 *   Mỡ máu cao: fried / fatty dishes (chiên, rán, quay, giòn; thịt ba chỉ, mỡ, da heo, lạp xưởng, xúc xích, pa tê).
 */
export type HealthTags = { allergens: string[]; contraindications: string[] };
type DishFacts = { name: string; role: string | null; ingredientNames: string[] };

const text = (value: string): string => ` ${value.normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const has = (haystack: string, words: string[]): boolean => words.some((word) => haystack.includes(text(word)));

const ALLERGEN_RULES: Array<{ words: string[]; tags: string[]; unless?: string[] }> = [
  { words: ["tôm"], tags: ["Tôm", "Hải sản"] },
  { words: ["cua"], tags: ["Cua", "Hải sản"] },
  { words: ["mực"], tags: ["Mực", "Hải sản"] },
  { words: ["hải sản", "nghêu", "sò", "hến", "ốc"], tags: ["Hải sản"] },
  { words: ["cá"], tags: ["Cá"] },
  { words: ["trứng"], tags: ["Trứng"] },
  { words: ["sữa"], tags: ["Sữa"], unless: ["sữa đậu nành"] },
  { words: ["đậu phộng", "lạc"], tags: ["Đậu phộng"] },
  { words: ["đậu nành", "đậu phụ", "đậu hũ", "tàu hũ", "nước tương", "xì dầu"], tags: ["Đậu nành"] },
  { words: ["gluten", "lúa mì", "bột mì", "bánh mì", "mì", "bột chiên"], tags: ["Gluten"], unless: ["mì chính"] },
  { words: ["mè", "vừng"], tags: ["Mè"] },
];

const SALTY_NAMES = ["kho", "rim", "mắm", "dưa muối", "cà pháo"];
const PROCESSED_MEATS = ["lạp xưởng", "xúc xích", "pa tê"];
const ORGANS = ["lòng", "gan", "cật", "tim", "tiết", "dồi", "pa tê"];
const SEAFOOD = ["tôm", "cua", "mực", "hải sản", "nghêu", "sò", "hến"];
const RICH_BEEF = ["phở bò", "bún bò", "bò kho", "bò hầm"];
const BONE_BROTH = ["xương", "giò heo"];
const FRIED_NAMES = ["chiên", "rán", "quay", "giòn"];
const FATTY = ["thịt ba chỉ", "mỡ", "da heo", ...PROCESSED_MEATS];

export function healthTagsFor(dish: DishFacts): HealthTags {
  const name = text(dish.name);
  const items = dish.ingredientNames.map(text);
  const anyItem = (words: string[], unless: string[] = []) => items.some((item) => has(item, words) && !has(item, unless));

  const allergens: string[] = [];
  for (const rule of ALLERGEN_RULES) {
    if (anyItem(rule.words, rule.unless)) rule.tags.forEach((tag) => { if (!allergens.includes(tag)) allergens.push(tag); });
  }

  const sugar = anyItem(["đường", "sữa đặc", "nước cốt dừa", "mật ong"]);
  const conditions: string[] = [];
  if (has(name, ["chè", "chua ngọt"]) || (dish.role === "do_uong" && sugar) || (dish.role === "trang_mieng" && sugar)) conditions.push("Tiểu đường");
  if (has(name, SALTY_NAMES) || anyItem(PROCESSED_MEATS)) conditions.push("Cao huyết áp");
  if (anyItem(ORGANS) || anyItem(SEAFOOD) || has(name, RICH_BEEF) || anyItem(BONE_BROTH)) conditions.push("Gout");
  if (has(name, FRIED_NAMES) || anyItem(FATTY)) conditions.push("Mỡ máu cao");
  return { allergens, contraindications: conditions };
}

type StoredIngredient = { name?: unknown };
const nameKey = (value: string): string => value.normalize("NFC").trim().toLocaleLowerCase("vi");

/**
 * Startup data step: starter dishes (matched by name) get computed tags where a field is still EMPTY. A field that
 * already has tags (admin-edited or seeded) is never changed, so running it again changes nothing.
 * Returns the dishes that got tags (names and the tags added only).
 */
export async function fillHealthTags(client: PrismaClient, recipes: SeedRecipe[] = seedRecipes): Promise<Array<{ name: string } & Partial<HealthTags>>> {
  const starters = new Map(recipes.map((recipe) => [nameKey(recipe.name), recipe]));
  const rows = await client.recipe.findMany({ select: { id: true, name: true, role: true, ingredients: true, ingredientDetails: true, allergens: true, contraindications: true } });
  const report: Array<{ name: string } & Partial<HealthTags>> = [];
  for (const row of rows) {
    const seed = starters.get(nameKey(row.name));
    if (!seed) continue;
    const needAllergens = row.allergens.length === 0;
    const needConditions = row.contraindications.length === 0;
    if (!needAllergens && !needConditions) continue;
    const details = Array.isArray(row.ingredientDetails) ? (row.ingredientDetails as StoredIngredient[]) : [];
    const ingredientNames = [...new Set([...details.flatMap((entry) => (typeof entry?.name === "string" ? [entry.name] : [])), ...row.ingredients])];
    const tags = healthTagsFor({ name: row.name, role: row.role ?? seedRole(seed) ?? null, ingredientNames });
    const data: Partial<HealthTags> = {};
    if (needAllergens && tags.allergens.length > 0) data.allergens = tags.allergens;
    if (needConditions && tags.contraindications.length > 0) data.contraindications = tags.contraindications;
    if (!data.allergens && !data.contraindications) continue;
    await client.recipe.update({ where: { id: row.id }, data });
    report.push({ name: row.name, ...data });
  }
  return report;
}
