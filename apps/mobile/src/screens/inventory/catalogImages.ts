import { useEffect, useState } from "react";
import { normalizeVi } from "./catalogSuggest";
import { type CatalogIngredient } from "./inventoryApi";
import { marketCatalog } from "./marketCatalog";

type CatalogImageRow = Pick<CatalogIngredient, "id" | "name" | "imageUrl" | "unit" | "unitLabel">;

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

/**
 * The linked catalog product's word for one piece ("quả", "bìa"), used to show the Kho amount ("2 quả"). Only an
 * item linked by productId takes it (a name match is not enough to change the word the user chose).
 */
export function catalogUnitLabelFor(item: { productId?: string | null }, rows: CatalogImageRow[]): string | null {
  if (!item.productId) return null;
  return rows.find((row) => row.id === item.productId)?.unitLabel ?? null;
}

/** Catalog rows for image fallbacks; empty until loaded (or when the catalog cannot be read: items keep the placeholder). */
export function useCatalogImages(accessToken: string | null): CatalogImageRow[] {
  // The shared market catalog copy (marketCatalog.ts): no separate catalog requests for images and unit words.
  const [rows, setRows] = useState<CatalogImageRow[]>(() => (accessToken ? marketCatalog(accessToken).peek() ?? [] : []));
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    marketCatalog(accessToken).get().then((loaded) => { if (active) setRows(loaded); }).catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);
  return rows;
}
