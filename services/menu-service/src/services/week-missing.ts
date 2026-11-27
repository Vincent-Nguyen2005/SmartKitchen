import type { PrismaClient } from "../../node_modules/.prisma/client-menu";
import type { KhoItem } from "./kho-suggest";
import { vnDay } from "./kho-suggest";
import { dishServings, roundQuantity, scaleQuantity, type PortionIngredient } from "./portions";
import { getKhoItems, getRecipes, itemDate, menuScope, type MenuOwner, type RecipeCandidate } from "./menu.service";

/**
 * "Tuần này còn thiếu": ingredients the family's menus need from today through Sunday (Vietnam days) that usable
 * Kho stock does not cover. Computed on read (no stored notification, so no duplicates and nothing to invalidate).
 *
 * - Amounts are scaled ONCE to each dish's planned portions with portions.ts (calorie-based menus store them per
 *   dish; older dishes use the menu's people; quantity × portions / recipe servings; perPerson rules included) and
 *   summed per product.
 * - Seasonings (isSeasoning) and free-text amounts ("vừa ăn") are left out.
 * - Product key: the admin catalog product (by productId on Kho rows; by exact normalized name, then English alias,
 *   for recipe ingredients), else the normalized name.
 * - Units: every recipe line and Kho row of a sold product is converted to the product's SALE unit measure:
 *   g / kg / ml / l directly (ml counted as g for kitchen liquids sold by weight, and back); the sale unit itself
 *   through its weight (catalog packGrams: Bún 1 gói ≈ 500 g, Bưởi 1 quả ≈ 1200 g, ml for bottles); pieces of a kg /
 *   pack product through the weight of one piece (catalog pieceGrams: Cà chua 1 quả ≈ 100 g).
 * - Missing amount = needed − usable Kho, rounded UP to the sale step: kg in 0.1 kg (at least 0.1, at most 20), every
 *   other sale unit in whole units. It is shown in the sale unit ("Thiếu 6 kg", "Thiếu 2 gói") and is exactly what
 *   "Thêm vào Giỏ hàng" adds (cartQuantity = quantity).
 * - A line that cannot be converted (pieces of a kg product without pieceGrams, grams of a pack without packGrams) is
 *   never guessed: it is kept in its recipe unit ("Thiếu 3 cái"), `unconverted: true`, cartQuantity null, and listed
 *   in the response's `unconverted`. A Kho row that cannot be converted does not count (`unitMismatch` when it is the
 *   only stock).
 * - Not sold in Đi chợ: shown in the recipe measure (g / ml switch to kg / l from 1000), no cart quantity.
 * - Usable Kho: quantity > 0, status not EXPIRED / CONSUMED / DISCARDED, expiry day not before today. Rows of an Đi chợ
 *   order still being delivered ("Đang giao", pendingDelivery) count as covered: they are already bought.
 */
export type WeekIngredient = PortionIngredient;
export type WeekDish = { ingredients: WeekIngredient[]; servings: number | null; people: number };
export type CatalogProduct = { id: string; name: string; englishName?: string | null; unit: string; imageUrl: string | null; price: number | null; discountPercent: number | null; packGrams?: number | null; pieceGrams?: number | null; unitLabel?: string | null };
export type MissingIngredient = {
  name: string;
  /** Missing amount in `unit`: the sale unit for sold, converted items (= cartQuantity); else the recipe measure. */
  quantity: number;
  unit: string;
  productId: string | null;
  imageUrl: string | null;
  price: number | null;
  discountPercent: number | null;
  /** Catalog sale unit; null when not sold. */
  saleUnit: string | null;
  /** Specific word for one piece-type sale unit ("quả", "bìa"); null = the unit's own word. */
  saleUnitLabel: string | null;
  /** How many sale units "Thêm vào Giỏ hàng" adds (kg: 0.1 steps; other units: whole numbers); null when not sold or unconverted. */
  cartQuantity: number | null;
  /** Sold, but the recipe amount has no known conversion to the sale unit: shown in the recipe unit, not added. */
  unconverted: boolean;
  /** Kho has this product only in a measure that cannot be converted: not subtracted. */
  unitMismatch: boolean;
};
/** A sold product whose recipe amount could not be converted to its sale unit (reported, never guessed). */
export type UnconvertedIngredient = { name: string; productId: string; recipeUnit: string; saleUnit: string };

const normalizeName = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const UNIT_ALIASES: Record<string, string> = { g: "GRAM", kg: "KILOGRAM", ml: "MILLILITER", l: "LITER" };
const unitCode = (unit: string | null | undefined): string | null => {
  if (!unit) return null;
  return UNIT_ALIASES[unit.trim().toLowerCase()] ?? unit.trim().toUpperCase();
};
type Measure = { measure: string; factor: number };
const WEIGHED = new Set(["MASS", "VOLUME"]);
/** Measure and factor to its base unit: g / ml are bases; kg / l are 1000; every piece unit is its own measure. */
const measureOf = (unit: string): Measure => {
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
const positive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * A product's sale unit as a measure: kg / g are mass, l / ml volume; a piece-type unit with a known weight per unit
 * is mass (1 gói = packGrams g) or, for a bottle, volume (1 chai = packGrams ml); otherwise its own measure (count).
 */
export const saleMeasure = (product: CatalogProduct): Measure => {
  const code = unitCode(product.unit) ?? "PIECE";
  const plain = measureOf(code);
  if (plain.measure === code && positive(product.packGrams)) return { measure: code === "BOTTLE" ? "VOLUME" : "MASS", factor: product.packGrams };
  return plain;
};

/**
 * `quantity` `unit` in the product's sale measure (base units: g, ml or sale units), or null when there is no known
 * conversion (never guessed).
 */
export function toSaleBase(quantity: number, unit: string, product: CatalogProduct): { measure: string; amount: number } | null {
  const sale = saleMeasure(product);
  if (unit === unitCode(product.unit)) return { measure: sale.measure, amount: quantity * sale.factor };
  const plain = measureOf(unit);
  if (WEIGHED.has(plain.measure)) {
    // Same measure; or ml ↔ g for kitchen liquids (cream, coconut milk ≈ 1 g/ml) when the sale unit is weighed.
    return WEIGHED.has(sale.measure) ? { measure: sale.measure, amount: quantity * plain.factor } : null;
  }
  // Pieces of a product sold by weight or in packs: through the weight of one piece.
  if (unit === "PIECE" && positive(product.pieceGrams) && WEIGHED.has(sale.measure)) return { measure: sale.measure, amount: quantity * product.pieceGrams };
  return null;
}

/** Missing base amount → sale units to buy: kg up to 0.1 kg (0.1 .. 20); other units up to whole units (at least 1). */
export function saleQuantity(short: number, product: CatalogProduct): number {
  if (unitCode(product.unit) === "KILOGRAM") return Math.min(KG_MAX, Math.max(1, Math.ceil(short / KG_STEP_GRAMS - 1e-9)) / 10);
  return Math.max(1, Math.ceil(short / saleMeasure(product).factor - 1e-9));
}

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

/** In the product's sale measure when it converts, else in the unit's own measure (kept apart, never mixed). */
const measured = (quantity: number, unit: string, product: CatalogProduct | null): { measure: string; amount: number } => {
  const converted = product ? toSaleBase(quantity, unit, product) : null;
  if (converted) return converted;
  const plain = measureOf(unit);
  return { measure: plain.measure, amount: quantity * plain.factor };
};

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

  // Needed, per product key and measure, in base units (the sale measure for converted lines).
  const needed = new Map<string, { name: string; product: CatalogProduct | null; measures: Map<string, number> }>();
  for (const dish of input.dishes) {
    for (const ingredient of dish.ingredients) {
      if (ingredient.isSeasoning) continue;
      const unit = unitCode(ingredient.unit);
      const quantity = scaleQuantity(ingredient, dish.servings, dish.people);
      if (!unit || quantity === null || !(quantity > 0)) continue;
      const key = keyFor(ingredient.name);
      const entry = needed.get(key) ?? { name: ingredient.name.trim(), product: productFor(ingredient.name), measures: new Map<string, number>() };
      const { measure, amount } = measured(quantity, unit, entry.product);
      entry.measures.set(measure, (entry.measures.get(measure) ?? 0) + amount);
      needed.set(key, entry);
    }
  }

  // Usable Kho, per product key and measure, in the same base units.
  const stock = new Map<string, Map<string, number>>();
  for (const item of input.kho) {
    const unit = unitCode(item.unit);
    if (!unit || !isUsableKho(item, input.today)) continue;
    const key = keyFor(item.name, item.productId);
    const { measure, amount } = measured(item.quantity as number, unit, productFor(item.name, item.productId));
    const measures = stock.get(key) ?? new Map<string, number>();
    measures.set(measure, (measures.get(measure) ?? 0) + amount);
    stock.set(key, measures);
  }

  const missing: MissingIngredient[] = [];
  for (const [key, entry] of needed) {
    const have = stock.get(key);
    const product = entry.product;
    const saleUnit = product ? unitCode(product.unit) : null;
    const sale = product ? saleMeasure(product) : null;
    for (const [measure, required] of entry.measures) {
      const covered = have?.get(measure) ?? 0;
      const short = required - covered;
      if (short <= 1e-9) continue;
      // Sold and converted: the sale amount, shown and added alike. Otherwise the recipe measure, nothing added.
      const cartQuantity = product && sale && saleUnit && measure === sale.measure ? saleQuantity(short, product) : null;
      const shown = cartQuantity !== null && saleUnit ? { quantity: cartQuantity, unit: saleUnit } : displayAmount(short, measure);
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
        unconverted: product !== null && cartQuantity === null,
        unitMismatch: covered === 0 && [...(have?.values() ?? [])].some((value) => value > 0),
      });
    }
  }
  // Sold in Đi chợ first, then by name.
  return missing.sort((left, right) => Number(right.productId !== null) - Number(left.productId !== null) || left.name.localeCompare(right.name, "vi"));
}

/** Sold items whose amount could not be converted to the sale unit (one entry per product and recipe measure). */
export const unconvertedOf = (items: MissingIngredient[]): UnconvertedIngredient[] =>
  items.flatMap((item) => (item.unconverted && item.productId && item.saleUnit ? [{ name: item.name, productId: item.productId, recipeUnit: item.unit, saleUnit: item.saleUnit }] : []));

/** Vietnam day `today` and the Sunday that ends its week (Sunday itself when today is Sunday). */
export function weekRange(now: Date = new Date()): { from: string; to: string } {
  const from = vnDay(now);
  const weekday = ((new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // Monday 1 ... Sunday 7
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + (7 - weekday) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

type MenuRow = { startDate: Date; servings: number | null; items: Array<{ recipeId: string | null; dayOfWeek: number; details: unknown }> };

/**
 * Dishes of the menus that fall within [from, to] (catalog recipes, plus AI dishes stored on the menu item). Each menu
 * item is one dish for the menu's people (scaled once later, in computeWeekMissing); a catalog recipe wins over an AI
 * dish on the same item, so nothing is counted twice.
 */
export function dishesInRange(menus: MenuRow[], recipes: RecipeCandidate[], range: { from: string; to: string }, memberCount?: number): WeekDish[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const dishes: WeekDish[] = [];
  for (const menu of menus) {
    for (const item of menu.items) {
      const day = itemDate(menu.startDate, item.dayOfWeek).toISOString().slice(0, 10);
      if (day < range.from || day > range.to) continue;
      const people = dishServings(item.details, menu.servings, memberCount);
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

/** Active admin catalog products (id, name, unit, image, price, running discount, weights) via admin-service's user catalog. */
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
        pieceGrams: typeof item.pieceGrams === "number" && item.pieceGrams > 0 ? item.pieceGrams : null,
        unitLabel: typeof item.unitLabel === "string" && item.unitLabel.trim() ? item.unitLabel.trim() : null,
      });
    }
    if (page >= (body.totalPages ?? 1)) break;
  }
  return products;
}

/** `unconverted`: sold items whose recipe amount has no known conversion to the sale unit (shown, not added). */
export type WeekMissingResult = { from: string; to: string; count: number; items: MissingIngredient[]; unconverted: UnconvertedIngredient[] };

export async function weekMissing(owner: MenuOwner, client: PrismaClient, options: { authorization?: string; now?: Date; recipes?: unknown[]; inventoryItems?: KhoItem[]; catalog?: CatalogProduct[] } = {}): Promise<WeekMissingResult> {
  const range = weekRange(options.now);
  // Kho belongs to a family: without one there is nothing to compare (and no notification).
  if (!owner.familyId) return { ...range, count: 0, items: [], unconverted: [] };
  const menus = await client.menu.findMany({
    where: { ...menuScope(owner), startDate: { lte: new Date(`${range.to}T00:00:00.000Z`) }, endDate: { gte: new Date(`${range.from}T00:00:00.000Z`) } },
    include: { items: true },
  });
  if (menus.length === 0) return { ...range, count: 0, items: [], unconverted: [] };
  const [recipes, kho, catalog] = await Promise.all([
    getRecipes(options.recipes),
    options.inventoryItems ? Promise.resolve(options.inventoryItems) : getKhoItems(owner.familyId, options.authorization),
    // Without the catalog the list is still right, only without images, prices and "Thêm vào Giỏ hàng".
    options.catalog ? Promise.resolve(options.catalog) : loadCatalogProducts(owner.userId).catch(() => [] as CatalogProduct[]),
  ]);
  const items = computeWeekMissing({ dishes: dishesInRange(menus, recipes, range, owner.memberCount), kho, catalog, today: range.from });
  return { ...range, count: items.length, items, unconverted: unconvertedOf(items) };
}
