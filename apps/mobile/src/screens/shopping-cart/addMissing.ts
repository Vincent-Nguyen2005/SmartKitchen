import { addToCart, findCatalogProduct, shoppingUnitFor } from "./cart";
import { shoppingUnits, type ShoppingUnit } from "./shoppingApi";

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

/** Adds one missing ingredient to Giỏ hàng; with the catalog price when the product's unit fits the recipe's. */
export async function addMissingToCart(accessToken: string, familyId: string, ingredient: MissingIngredient): Promise<void> {
  const quantity = ingredient.quantity && ingredient.quantity > 0 ? ingredient.quantity : 1;
  const unit = isShoppingUnit(ingredient.unit) ? ingredient.unit : null;
  const product = await findCatalogProduct(accessToken, ingredient.name).catch(() => null);
  if (product) {
    const productUnit = shoppingUnitFor(product);
    const converted = unit ? convertQuantity(quantity, unit, productUnit) : quantity;
    if (converted !== null) {
      await addToCart(accessToken, familyId, { name: product.name, quantity: converted, unit: productUnit, product });
      return;
    }
  }
  await addToCart(accessToken, familyId, { name: ingredient.name, quantity, unit: unit ?? "PIECE" });
}
