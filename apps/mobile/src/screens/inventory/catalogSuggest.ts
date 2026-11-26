import type { CatalogIngredient, InventoryUnit } from "./inventoryApi";

export const INVENTORY_UNITS: InventoryUnit[] = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE", "PACK", "BOTTLE", "CAN", "BOX"];

/** Lowercase, without Vietnamese accents ("Cà chua" and "ca chua" match). */
export const normalizeVi = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/\s+/g, " ").trim();

/** Catalog rows whose name contains the typed text; names starting with it come first. */
export const matchCatalog = (catalog: CatalogIngredient[], typed: string, limit = 5): CatalogIngredient[] => {
  const query = normalizeVi(typed);
  if (query.length < 1) return [];
  const starts: CatalogIngredient[] = [];
  const contains: CatalogIngredient[] = [];
  for (const entry of catalog) {
    const name = normalizeVi(entry.name);
    if (name === query) continue; // already typed in full
    if (name.startsWith(query)) starts.push(entry);
    else if (name.includes(query)) contains.push(entry);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
};

const UNIT_ALIASES: Record<string, InventoryUnit> = {
  g: "GRAM", gram: "GRAM", gam: "GRAM", kg: "KILOGRAM", kilogram: "KILOGRAM", can: "KILOGRAM",
  ml: "MILLILITER", l: "LITER", lit: "LITER", cai: "PIECE", qua: "PIECE", trai: "PIECE", "cai / qua": "PIECE",
  goi: "PACK", bo: "PACK", "goi / bo": "PACK", chai: "BOTTLE", lon: "CAN", hop: "BOX",
};

/** Short Vietnamese unit labels shown everywhere in the app (never the code or English). */
export const UNIT_LABELS: Record<InventoryUnit, string> = {
  GRAM: "g", KILOGRAM: "kg", MILLILITER: "ml", LITER: "lít",
  PIECE: "cái/quả", PACK: "gói/bó", BOTTLE: "chai", CAN: "lon", BOX: "hộp",
};

/** Label for a unit code or an older free-text unit ("Gram", "Kg", "KILOGRAM" → "g", "kg"); unknown text as is. */
export const unitLabel = (unit: string | null | undefined): string => {
  if (!unit) return "";
  const code = unitFromCatalog(unit);
  return code ? UNIT_LABELS[code] : unit.trim();
};

/** Admin stores defaultUnit as free text: the Unit code, or an older label such as "g". */
export const unitFromCatalog = (defaultUnit: string): InventoryUnit | null => {
  const code = defaultUnit.trim().toUpperCase();
  if ((INVENTORY_UNITS as string[]).includes(code)) return code as InventoryUnit;
  return UNIT_ALIASES[normalizeVi(defaultUnit)] ?? null;
};

const pad = (value: number) => String(value).padStart(2, "0");
/** Device-local calendar day `days` after today, as YYYY-MM-DD. */
export const dayFromToday = (days = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The catalog product with exactly this name (accent- and case-insensitive), or null. */
export const catalogProductNamed = (catalog: readonly CatalogIngredient[], name: string): CatalogIngredient | null => {
  const key = normalizeVi(name);
  return key ? catalog.find((product) => normalizeVi(product.name) === key) ?? null : null;
};

/**
 * Kho add form: the sale unit of the catalog product named exactly `name` (kg, gói, quả...), so a typed or suggested
 * name defaults to the unit the existing Kho row most likely has and the "Đã có trong kho" check can find it.
 * null when the name is not a catalog product or its unit is unknown.
 */
export const catalogUnitForName = (catalog: readonly CatalogIngredient[], name: string): InventoryUnit | null => {
  const product = catalogProductNamed(catalog, name);
  return product ? unitFromCatalog(product.unit) : null;
};
