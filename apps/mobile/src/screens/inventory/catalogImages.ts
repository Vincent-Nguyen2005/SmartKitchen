import { useEffect, useState } from "react";
import { normalizeVi } from "./catalogSuggest";
import { inventoryApi, type CatalogIngredient } from "./inventoryApi";

type CatalogImageRow = Pick<CatalogIngredient, "id" | "name" | "imageUrl">;

/**
 * Catalog product image for a Kho item without its own photo: the product with the item's stored id (bought from
 * Giỏ hàng) first, else the product whose name matches (accent- and case-insensitive, normalizeVi). The image is only
 * displayed; it is never saved as the family's photo.
 */
export function catalogImageFor(item: { name: string; productId?: string | null }, rows: CatalogImageRow[]): string | null {
  if (item.productId) {
    const byId = rows.find((row) => row.id === item.productId);
    if (byId?.imageUrl) return byId.imageUrl;
  }
  const name = normalizeVi(item.name);
  if (!name) return null;
  return rows.find((row) => row.imageUrl && normalizeVi(row.name) === name)?.imageUrl ?? null;
}

const CACHE_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
let cache: { at: number; rows: CatalogImageRow[] } | null = null;
let loading: Promise<CatalogImageRow[]> | null = null;

/** All active catalog rows (id, name, image), loaded once and kept for 10 minutes; shared by every screen. */
function loadCatalogImages(accessToken: string): Promise<CatalogImageRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.rows);
  if (loading) return loading;
  loading = (async () => {
    const rows: CatalogImageRow[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await inventoryApi.ingredientCatalog(accessToken, { page, limit: PAGE_SIZE });
      rows.push(...result.items.map(({ id, name, imageUrl }) => ({ id, name, imageUrl })));
      if (page >= result.totalPages) break;
    }
    cache = { at: Date.now(), rows };
    return rows;
  })().finally(() => { loading = null; });
  return loading;
}

/** Catalog rows for image fallbacks; empty until loaded (or when the catalog cannot be read: items keep the placeholder). */
export function useCatalogImages(accessToken: string | null): CatalogImageRow[] {
  const [rows, setRows] = useState<CatalogImageRow[]>(() => cache?.rows ?? []);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    loadCatalogImages(accessToken).then((loaded) => { if (active) setRows(loaded); }).catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);
  return rows;
}
