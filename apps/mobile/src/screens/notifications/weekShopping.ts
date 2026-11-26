import { amountText } from "../shopping-cart/unitDisplay";

/** GET /api/menus/week-missing (menu-service): missing ingredients from today through Sunday. */
export type WeekMissingItem = {
  name: string;
  /** In the sale unit for sold, converted items (equal to cartQuantity); else in the recipe unit. */
  quantity: number;
  unit: string;
  productId: string | null;
  imageUrl: string | null;
  price: number | null;
  discountPercent: number | null;
  saleUnit: string | null;
  /** Word for one piece-type sale unit ("quả", "bìa"); null = the unit's own word. */
  saleUnitLabel?: string | null;
  /** What "Thêm vào Giỏ hàng" adds, in the sale unit; null when not sold or not convertible. */
  cartQuantity: number | null;
  /** Sold, but no known conversion from the recipe unit: shown in the recipe unit, not added. */
  unconverted?: boolean;
  unitMismatch: boolean;
};
export type WeekMissing = { from: string; to: string; count: number; items: WeekMissingItem[]; unconverted?: Array<{ name: string; productId: string; recipeUnit: string; saleUnit: string }> };

/** Goes into Giỏ hàng: sold, converted to the sale unit, with an amount. */
export const isPurchasable = (item: WeekMissingItem): boolean =>
  Boolean(item.productId && item.saleUnit && item.cartQuantity && !item.unconverted);

/**
 * The card's one line: "Thiếu 6 kg", "Thiếu 2 gói", "Thiếu 20 quả" (sale unit, its own word); an item that is not
 * converted keeps its recipe unit ("Thiếu 3 cái", "Thiếu 400 g").
 */
export const missingLine = (item: WeekMissingItem): string =>
  `Thiếu ${amountText(item.quantity, item.unit, item.unit === item.saleUnit ? item.saleUnitLabel : null)}`;

/** Only for items "Thêm vào Giỏ hàng" skips, so the reason is visible; null for everything that is added. */
export const skipNote = (item: WeekMissingItem): { text: string; warning: boolean } | null => {
  if (!item.productId) return { text: "Chưa có bán", warning: true };
  if (!isPurchasable(item)) return { text: item.unitMismatch ? "Kho có nhưng khác đơn vị" : "Chưa đổi được sang đơn vị bán", warning: false };
  return null;
};

/** The Giỏ hàng lines: exactly the amount shown on each card, in the sale unit. */
export const cartLines = (items: WeekMissingItem[]) =>
  items.filter(isPurchasable).map((item) => ({
    name: item.name,
    quantity: item.cartQuantity as number,
    unit: item.saleUnit as string,
    productId: item.productId as string,
    unitPrice: item.price,
    discountPercent: item.discountPercent,
    imageUrl: item.imageUrl,
  }));
