import { unitPriceAfterDiscount } from "./pricing";
import { type CatalogIngredient } from "../inventory/inventoryApi";
import { catalogProductNamed, normalizeVi, unitFromCatalog } from "../inventory/catalogSuggest";
import { marketCatalog } from "../inventory/marketCatalog";
import { shoppingApi, type CartSnapshot, type ShoppingItem, type ShoppingList, type ShoppingUnit } from "./shoppingApi";

/**
 * Giỏ hàng = the family's active shopping list. A line stays in the cart until it is in Kho
 * (inventoryAppliedAt set); this includes older items marked bought but never synced, so "Mua" can finish them.
 */
export const cartLines = (lists: ShoppingList[]): ShoppingItem[] =>
  lists.filter((list) => list.status === "ACTIVE").flatMap((list) => list.items).filter((item) => !item.inventoryAppliedAt);

/** Shopping-list unit for a catalog product; admin units are codes or older labels such as "g". */
export const shoppingUnitFor = (product: CatalogIngredient): ShoppingUnit => unitFromCatalog(product.unit) ?? "PIECE";

export const snapshotOf = (product: CatalogIngredient): CartSnapshot => ({
  unitPrice: product.price,
  discountPercent: product.discountPercent,
  productId: product.id,
  imageUrl: product.imageUrl,
});

/** The active catalog product with exactly this name (accent-insensitive), or null; from the shared catalog copy. */
export async function findCatalogProduct(accessToken: string, name: string): Promise<CatalogIngredient | null> {
  if (!normalizeVi(name)) return null;
  return catalogProductNamed(await marketCatalog(accessToken).get(), name);
}

/**
 * Price of one unit after discount: the snapshot taken when the line was added, else the current catalog price
 * (older lines). null = no price ("Chưa có giá", counted as 0).
 */
export const unitPriceOf = (item: ShoppingItem, catalog?: CatalogIngredient | null): number | null => {
  if (typeof item.unitPrice === "number") return unitPriceAfterDiscount(item.unitPrice, item.discountPercent);
  return catalog ? unitPriceAfterDiscount(catalog.price, catalog.discountPercent) : null;
};

/** Adds to Giỏ hàng with the product's price snapshot; the server merges the same product + unit. */
export async function addToCart(accessToken: string, familyId: string, input: { name: string; quantity: number; unit?: ShoppingUnit; product?: CatalogIngredient | null }) {
  const product = input.product ?? null;
  return shoppingApi.addItem(accessToken, {
    familyId,
    name: product?.name ?? input.name,
    quantity: input.quantity,
    unit: input.unit ?? (product ? shoppingUnitFor(product) : "PIECE"),
    ...(product ? snapshotOf(product) : {}),
  });
}

/** Khuyến mãi "Mua": the catalog product with the promotion's name (if any) gives the unit and price snapshot. */
export async function addPromotionToCart(accessToken: string, familyId: string, name: string) {
  const product = await findCatalogProduct(accessToken, name).catch(() => null);
  return addToCart(accessToken, familyId, { name, quantity: 1, product });
}
