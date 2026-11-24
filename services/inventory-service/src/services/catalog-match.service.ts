import { normalizeName } from "../lib/names";
import { loadCatalogLabels, type CatalogLabel } from "./photo-recognition/catalog-labels";

/**
 * Admin catalog product for a Kho item name: exact match after normalizeName on the Vietnamese name, then on the
 * product's English alias (englishName). Null when nothing matches.
 */
export function matchCatalogProduct(name: string, catalog: CatalogLabel[]): CatalogLabel | null {
  const key = normalizeName(name);
  if (!key) return null;
  return catalog.find((entry) => normalizeName(entry.name) === key)
    ?? catalog.find((entry) => entry.englishName !== null && normalizeName(entry.englishName) === key)
    ?? null;
}

export type CatalogLoader = (userId: string) => Promise<CatalogLabel[]>;
let loader: CatalogLoader = (userId) => loadCatalogLabels(userId);
/** Tests only. */
export const setCatalogLoader = (next: CatalogLoader): void => { loader = next; };

/**
 * The catalog product for `name`, or null when it matches none. `undefined` when the catalog cannot be read: callers
 * then leave productId as it is (creating or renaming an item never fails because admin-service is down).
 */
export async function resolveCatalogProduct(userId: string, name: string): Promise<CatalogLabel | null | undefined> {
  try {
    return matchCatalogProduct(name, await loader(userId));
  } catch (error) {
    console.error(JSON.stringify({ event: "catalog_match_unavailable", message: error instanceof Error ? error.message : String(error) }));
    return undefined;
  }
}
