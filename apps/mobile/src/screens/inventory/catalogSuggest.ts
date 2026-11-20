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
