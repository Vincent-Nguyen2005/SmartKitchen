import { addToCart, findCatalogProduct, shoppingUnitFor } from "./cart";
import { shoppingUnits, type ShoppingUnit } from "./shoppingApi";
import { quantityRuleFor } from "./quantityRule";
import type { CatalogIngredient } from "../inventory/inventoryApi";

/** An ingredient a dish needs that is not (enough) in Kho. */
export type MissingIngredient = { name: string; quantity: number | null; unit: string | null };

const isShoppingUnit = (unit: string | null): unit is ShoppingUnit => shoppingUnits.includes(unit as ShoppingUnit);
const unitScale: Partial<Record<ShoppingUnit, { group: string; factor: number }>> = {
  GRAM: { group: "mass", factor: 1 },
  KILOGRAM: { group: "mass", factor: 1000 },
  MILLILITER: { group: "volume", factor: 1 },
  LITER: { group: "volume", factor: 1000 },
};

/** Quantity in another unit of the same kind (g ↔ kg, ml ↔ l); null when they cannot be converted. */
function convertQuantity(quantity: number, from: ShoppingUnit, to: ShoppingUnit): number | null {
  if (from === to) return quantity;
  const [source, target] = [unitScale[from], unitScale[to]];
  if (!source || !target || source.group !== target.group) return null;
  return Math.ceil(((quantity * source.factor) / target.factor) * 100) / 100;
}

/**
 * Amount to buy in the product's sale unit: kg rounded up to 0.1 kg (0.1 .. 20); a pack product with a known weight
 * from recipe grams (150 g of Hành lá at 100 g a bó -> 2 bó); other count units rounded up to whole units.
 * null when the recipe's unit cannot become the sale unit.
 */
function saleQuantity(quantity: number, unit: ShoppingUnit | null, product: CatalogIngredient, productUnit: ShoppingUnit): number | null {
  const rule = quantityRuleFor(productUnit);
  const grams = unit ? convertQuantity(quantity, unit, "GRAM") : null;
  if (grams !== null && product.packGrams && product.packGrams > 0 && (productUnit === "PACK" || productUnit === "PIECE")) {
    return Math.min(rule.max, Math.max(1, Math.ceil(grams / product.packGrams - 1e-9)));
  }
  const converted = unit ? convertQuantity(quantity, unit, productUnit) : quantity;
  if (converted === null) return null;
  if (rule.decimals) return Math.min(rule.max, Math.max(rule.min, Math.ceil(converted * 10 - 1e-9) / 10));
  if (unitScale[productUnit]) return converted; // g / ml / l keep the recipe amount
  return Math.min(rule.max, Math.max(1, Math.ceil(converted - 1e-9)));
}

/** Adds one missing ingredient to Giỏ hàng; with the catalog price when the product's unit fits the recipe's. */
export async function addMissingToCart(accessToken: string, familyId: string, ingredient: MissingIngredient): Promise<void> {
  const quantity = ingredient.quantity && ingredient.quantity > 0 ? ingredient.quantity : 1;
  const unit = isShoppingUnit(ingredient.unit) ? ingredient.unit : null;
  const product = await findCatalogProduct(accessToken, ingredient.name).catch(() => null);
  if (product) {
    const productUnit = shoppingUnitFor(product);
    const converted = saleQuantity(quantity, unit, product, productUnit);
    if (converted !== null) {
      await addToCart(accessToken, familyId, { name: product.name, quantity: converted, unit: productUnit, product });
      return;
    }
  }
  await addToCart(accessToken, familyId, { name: ingredient.name, quantity, unit: unit ?? "PIECE" });
}
