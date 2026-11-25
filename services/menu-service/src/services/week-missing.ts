import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import type { KhoItem } from "./kho-suggest";
import { vnDay } from "./kho-suggest";
import { menuPeople, roundQuantity, scaleQuantity, type PortionIngredient } from "./portions";
import { getKhoItems, getRecipes, itemDate, menuScope, type MenuOwner, type RecipeCandidate } from "./menu.service";

/**
 * "Tuần này còn thiếu": ingredients the family's menus need from today through Sunday (Vietnam days) that usable
 * Kho stock does not cover. Computed on read (no stored notification, so no duplicates and nothing to invalidate).
 *
 * - Amounts are scaled to each menu's people with portions.ts (perPerson rules included) and summed per product.
 * - Seasonings (isSeasoning) and free-text amounts ("vừa ăn") are left out.
 * - Product key: the admin catalog product (by productId on Kho rows; by exact normalized name, then English alias,
 *   for recipe ingredients), else the normalized name.
 * - Units: only the same measure is subtracted (g with kg, ml with l, pieces with the same piece unit). A product
 *   sold in packs or pieces with a known weight per unit (catalog packGrams, e.g. Hành lá 1 bó ≈ 100 g, Bưởi 1 quả
 *   ≈ 1200 g; ml for bottles) counts those units as grams (ml), in recipes and in Kho. A Kho row in another measure
 *   does not count; the item is then marked `unitMismatch`. When every recipe line counted in the sale unit itself
 *   (3 quả trứng), the missing amount is shown in that unit too.
 * - Cart quantity: kg products round the missing amount up to 0.1 kg (at least 0.1, at most 20); everything else
 *   rounds up to whole sale units (packs through their pack weight).
 * - Usable Kho: quantity > 0, status not EXPIRED / CONSUMED / DISCARDED, expiry day not before today.
 */
export type WeekIngredient = PortionIngredient;
export type WeekDish = { ingredients: WeekIngredient[]; servings: number | null; people: number };
export type CatalogProduct = { id: string; name: string; englishName?: string | null; unit: string; imageUrl: string | null; price: number | null; discountPercent: number | null; packGrams?: number | null; unitLabel?: string | null };
export type MissingIngredient = {
  name: string;
  /** Missing amount in `unit` (g / ml switch to kg / l from 1000). */
  quantity: number;
  unit: string;
  productId: string | null;
  imageUrl: string | null;
  price: number | null;
  discountPercent: number | null;
  /** Catalog sale unit and how many of it to put in Giỏ hàng (kg: 0.1 steps; other units: whole numbers); null when not sold. */
  saleUnit: string | null;
  /** Specific word for one piece-type sale unit ("quả", "bìa"); null = the unit's own word. */
  saleUnitLabel: string | null;
  cartQuantity: number | null;
  /** Kho has this product only in another measure (e.g. cái vs kg): not subtracted. */
  unitMismatch: boolean;
};

const normalizeName = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const UNIT_ALIASES: Record<string, string> = { g: "GRAM", kg: "KILOGRAM", ml: "MILLILITER", l: "LITER" };
const unitCode = (unit: string | null | undefined): string | null => {
  if (!unit) return null;
  return UNIT_ALIASES[unit.trim().toLowerCase()] ?? unit.trim().toUpperCase();
};
/** Measure and factor to its base unit: g / ml are bases; kg / l are 1000; every piece unit is its own measure. */
const measureOf = (unit: string): { measure: string; factor: number } => {
  switch (unit) {
    case "GRAM": return { measure: "MASS", factor: 1 };
    case "KILOGRAM": return { measure: "MASS", factor: 1000 };
    case "MILLILITER": return { measure: "VOLUME", factor: 1 };
    case "LITER": return { measure: "VOLUME", factor: 1000 };
    default: return { measure: unit, factor: 1 };
  }
};
/** Cart limits for kg products (same as shopping-list-service's quantity rule). */
const KG_STEP_GRAMS = 100;
const KG_MAX = 20;
/**
 * Like measureOf, but a product's own pack / piece unit with a known weight per unit is mass (1 bó = packGrams g);
 * a bottle is volume (1 chai = packGrams ml).
 */
const measureFor = (unit: string, product: CatalogProduct | null): { measure: string; factor: number } => {
  const plain = measureOf(unit);
  if (product?.packGrams && product.packGrams > 0 && plain.measure === unit && unit === unitCode(product.unit)) return { measure: unit === "BOTTLE" ? "VOLUME" : "MASS", factor: product.packGrams };
  return plain;
};
const displayAmount = (base: number, measure: string): { quantity: number; unit: string } => {
  if (measure === "MASS") return base >= 1000 ? { quantity: roundQuantity(base / 1000, "KILOGRAM"), unit: "KILOGRAM" } : { quantity: roundQuantity(base, "GRAM"), unit: "GRAM" };
  if (measure === "VOLUME") return base >= 1000 ? { quantity: roundQuantity(base / 1000, "LITER"), unit: "LITER" } : { quantity: roundQuantity(base, "MILLILITER"), unit: "MILLILITER" };
  return { quantity: roundQuantity(base, measure), unit: measure };
};
const vnExpiryDay = (expiryDate: string): string => new Date(new Date(expiryDate).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function isUsableKho(item: KhoItem, today: string): boolean {
  if (item.quantity === null || item.quantity <= 0) return false;
  if (item.status && ["EXPIRED", "CONSUMED", "DISCARDED"].includes(item.status)) return false;
  return !item.expiryDate || vnExpiryDay(item.expiryDate) >= today;
}

export function computeWeekMissing(input: { dishes: WeekDish[]; kho: KhoItem[]; catalog: CatalogProduct[]; today: string }): MissingIngredient[] {
  const byName = new Map<string, CatalogProduct>();
  for (const product of input.catalog) byName.set(normalizeName(product.name), product);
  for (const product of input.catalog) if (product.englishName && !byName.has(normalizeName(product.englishName))) byName.set(normalizeName(product.englishName), product);
  const byId = new Map(input.catalog.map((product) => [product.id, product]));
  const productFor = (name: string, productId?: string | null): CatalogProduct | null => (productId ? byId.get(productId) : undefined) ?? byName.get(normalizeName(name)) ?? null;
  const keyFor = (name: string, productId?: string | null): string => {
    const product = productFor(name, productId);
    return product ? `product:${product.id}` : productId ? `product:${productId}` : `name:${normalizeName(name)}`;
  };

  // Needed, per product key and measure, in base units.
  // `units`: recipe units seen per measure (a shortage counted only in pieces is shown in pieces).
  const needed = new Map<string, { name: string; product: CatalogProduct | null; measures: Map<string, number>; units: Map<string, Set<string>> }>();
  for (const dish of input.dishes) {
    for (const ingredient of dish.ingredients) {
      if (ingredient.isSeasoning) continue;
      const unit = unitCode(ingredient.unit);
      const quantity = scaleQuantity(ingredient, dish.servings, dish.people);
      if (!unit || quantity === null || !(quantity > 0)) continue;
      const key = keyFor(ingredient.name);
      const entry = needed.get(key) ?? { name: ingredient.name.trim(), product: productFor(ingredient.name), measures: new Map<string, number>(), units: new Map<string, Set<string>>() };
      const { measure, factor } = measureFor(unit, entry.product);
      entry.measures.set(measure, (entry.measures.get(measure) ?? 0) + quantity * factor);
      entry.units.set(measure, (entry.units.get(measure) ?? new Set<string>()).add(unit));
      needed.set(key, entry);
    }
  }

  // Usable Kho, per product key and measure, in base units.
  const stock = new Map<string, Map<string, number>>();
  for (const item of input.kho) {
    const unit = unitCode(item.unit);
    if (!unit || !isUsableKho(item, input.today)) continue;
    const key = keyFor(item.name, item.productId);
    const { measure, factor } = measureFor(unit, productFor(item.name, item.productId));
    const measures = stock.get(key) ?? new Map<string, number>();
    measures.set(measure, (measures.get(measure) ?? 0) + (item.quantity as number) * factor);
    stock.set(key, measures);
  }

  const missing: MissingIngredient[] = [];
  for (const [key, entry] of needed) {
    const have = stock.get(key);
    for (const [measure, required] of entry.measures) {
      const covered = have?.get(measure) ?? 0;
      const short = required - covered;
      if (short <= 1e-9) continue;
      const product = entry.product;
      const saleCode = product ? unitCode(product.unit) : null;
      const recipeUnits = entry.units.get(measure);
      const pieceFactor = saleCode && recipeUnits?.size === 1 && recipeUnits.has(saleCode) ? measureFor(saleCode, product).factor : 1;
      const shown = pieceFactor > 1 && saleCode ? { quantity: roundQuantity(short / pieceFactor, saleCode), unit: saleCode } : displayAmount(short, measure);
      let cartQuantity: number | null = null;
      const saleUnit = product ? unitCode(product.unit) : null;
      if (product && saleUnit) {
        const sale = measureFor(saleUnit, product);
        if (sale.measure !== measure) cartQuantity = 1; // another measure: one unit
        // kg: rounded up to 0.1 kg (0.65 kg -> 0.7 kg), within the cart's 0.1 .. 20 kg.
        else if (saleUnit === "KILOGRAM") cartQuantity = Math.min(KG_MAX, Math.max(1, Math.ceil(short / KG_STEP_GRAMS - 1e-9)) / 10);
        // Whole sale units (packs through their weight: 150 g of Hành lá at 100 g a bó -> 2 bó).
        else cartQuantity = Math.max(1, Math.ceil(short / sale.factor - 1e-9));
      }
      missing.push({
        name: product?.name ?? entry.name,
        quantity: shown.quantity,
        unit: shown.unit,
        productId: product?.id ?? null,
        imageUrl: product?.imageUrl ?? null,
        price: product?.price ?? null,
        discountPercent: product?.discountPercent ?? null,
        saleUnit,
        saleUnitLabel: product?.unitLabel ?? null,
        cartQuantity,
        unitMismatch: covered === 0 && [...(have?.values() ?? [])].some((value) => value > 0),
      });
    }
  }
  // Sold in Đi chợ first, then by name.
  return missing.sort((left, right) => Number(right.productId !== null) - Number(left.productId !== null) || left.name.localeCompare(right.name, "vi"));
}

/** Vietnam day `today` and the Sunday that ends its week (Sunday itself when today is Sunday). */
export function weekRange(now: Date = new Date()): { from: string; to: string } {
  const from = vnDay(now);
  const weekday = ((new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // Monday 1 ... Sunday 7
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + (7 - weekday) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

type MenuRow = { startDate: Date; servings: number | null; items: Array<{ recipeId: string | null; dayOfWeek: number; details: unknown }> };

/** Dishes of the menus that fall within [from, to] (catalog recipes, plus AI dishes stored on the menu item). */
export function dishesInRange(menus: MenuRow[], recipes: RecipeCandidate[], range: { from: string; to: string }, memberCount?: number): WeekDish[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const dishes: WeekDish[] = [];
  for (const menu of menus) {
    const people = menuPeople(menu.servings, memberCount);
    for (const item of menu.items) {
      const day = itemDate(menu.startDate, item.dayOfWeek).toISOString().slice(0, 10);
      if (day < range.from || day > range.to) continue;
      const recipe = item.recipeId ? byId.get(item.recipeId) : undefined;
      if (recipe) { dishes.push({ ingredients: recipe.details, servings: recipe.servings, people }); continue; }
      const aiDish = (item.details as { aiDish?: { ingredients?: unknown; servings?: unknown } } | null)?.aiDish;
      if (aiDish && Array.isArray(aiDish.ingredients)) {
        const ingredients = aiDish.ingredients.flatMap((value): WeekIngredient[] => {
          const entry = value as { name?: unknown; quantity?: unknown; unit?: unknown };
          return typeof entry.name === "string" ? [{ name: entry.name, quantity: typeof entry.quantity === "number" ? entry.quantity : null, unit: typeof entry.unit === "string" ? entry.unit : null }] : [];
        });
        dishes.push({ ingredients, servings: typeof aiDish.servings === "number" ? aiDish.servings : null, people });
      }
    }
  }
  return dishes;
}

/** Active admin catalog products (id, name, unit, image, price, running discount) via admin-service's user catalog. */
export async function loadCatalogProducts(userId: string, fetchImpl: typeof fetch = fetch): Promise<CatalogProduct[]> {
  const baseUrl = (process.env.ADMIN_SERVICE_URL ?? "http://localhost:4011").replace(/\/+$/, "");
  const products: CatalogProduct[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetchImpl(`${baseUrl}/catalog/ingredients?page=${page}&limit=50`, { headers: { "x-user-id": userId }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Catalog answered ${response.status}`);
    const body = await response.json() as { items?: Array<Record<string, unknown>>; totalPages?: number };
    for (const item of body.items ?? []) {
      if (typeof item.id !== "string" || typeof item.name !== "string") continue;
      products.push({
        id: item.id, name: item.name,
        englishName: typeof item.englishName === "string" ? item.englishName : null,
        unit: typeof item.unit === "string" ? item.unit : "PIECE",
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        price: typeof item.price === "number" ? item.price : null,
        discountPercent: typeof item.discountPercent === "number" ? item.discountPercent : null,
        packGrams: typeof item.packGrams === "number" && item.packGrams > 0 ? item.packGrams : null,
        unitLabel: typeof item.unitLabel === "string" && item.unitLabel.trim() ? item.unitLabel.trim() : null,
      });
    }
    if (page >= (body.totalPages ?? 1)) break;
  }
  return products;
}

export type WeekMissingResult = { from: string; to: string; count: number; items: MissingIngredient[] };

export async function weekMissing(owner: MenuOwner, client: PrismaClient, options: { authorization?: string; now?: Date; recipes?: unknown[]; inventoryItems?: KhoItem[]; catalog?: CatalogProduct[] } = {}): Promise<WeekMissingResult> {
  const range = weekRange(options.now);
  // Kho belongs to a family: without one there is nothing to compare (and no notification).
  if (!owner.familyId) return { ...range, count: 0, items: [] };
  const menus = await client.menu.findMany({
    where: { ...menuScope(owner), startDate: { lte: new Date(`${range.to}T00:00:00.000Z`) }, endDate: { gte: new Date(`${range.from}T00:00:00.000Z`) } },
    include: { items: true },
  });
  if (menus.length === 0) return { ...range, count: 0, items: [] };
  const [recipes, kho, catalog] = await Promise.all([
    getRecipes(options.recipes),
    options.inventoryItems ? Promise.resolve(options.inventoryItems) : getKhoItems(owner.familyId, options.authorization),
    // Without the catalog the list is still right, only without images, prices and "Thêm vào Giỏ hàng".
    options.catalog ? Promise.resolve(options.catalog) : loadCatalogProducts(owner.userId).catch(() => [] as CatalogProduct[]),
  ]);
  const items = computeWeekMissing({ dishes: dishesInRange(menus, recipes, range, owner.memberCount), kho, catalog, today: range.from });
  return { ...range, count: items.length, items };
}
