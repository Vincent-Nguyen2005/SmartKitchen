/**
 * Đi chợ / Giỏ hàng prices. One rule everywhere (sheet, cart lines, cart total):
 * 1. unit price after an active discount, rounded to whole đồng: round(price × (100 − %) / 100) (discountedPrice);
 * 2. line total = round(unit price × quantity), kg decimals included (1,5 kg × 300.000đ = 450.000đ);
 * 3. cart total = sum of the rounded line totals, so it always equals the lines shown.
 * Pure functions (no React Native), covered by pricing.test.ts.
 */
import { discountedPrice, formatVnd } from "../../services/format";

/** Unit price after an active discount (whole đồng); null when the product has no price. */
export const unitPriceAfterDiscount = (price: number | null | undefined, discountPercent: number | null | undefined): number | null =>
  typeof price === "number" ? discountedPrice(price, discountPercent ?? 0) : null;

/** Line total in whole đồng; null when there is no unit price ("Chưa có giá"). */
export const lineTotal = (unitPrice: number | null, quantity: number): number | null =>
  unitPrice === null || !Number.isFinite(quantity) ? null : Math.round(unitPrice * quantity);

/** Sum of line totals; lines without a price count as 0. */
export const cartTotal = (lines: ReadonlyArray<{ unitPrice: number | null; quantity: number }>): number =>
  lines.reduce((sum, line) => sum + (lineTotal(line.unitPrice, line.quantity) ?? 0), 0);

/** "300.000đ / kg", "5.000đ / gói". */
export const unitPriceText = (unitPrice: number, unitWord: string): string => `${formatVnd(unitPrice)} / ${unitWord}`;
