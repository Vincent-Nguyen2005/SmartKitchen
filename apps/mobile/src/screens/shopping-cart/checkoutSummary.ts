/**
 * Checkout summary rows (pure; covered by checkoutSummary.test.ts), the same in the checkout sheet, Giỏ hàng, Đơn hàng,
 * the shipper receipt and Chi tiêu: "Tạm tính", "Khuyến mãi: <tên>  −<số tiền>" (success colour), "Tổng thanh toán".
 * Totals always come from the server (automatic promotion, whole VND); nothing is recomputed here.
 */
import { formatVnd } from "../../services/format";

export type SummaryRow = { key: "subtotal" | "promotion" | "total"; label: string; value: string; tone?: "success"; strong?: boolean };
type Totals = { subtotal: number; discount: number; promotionName: string | null; total: number };

/** "−15.000đ" */
export const discountText = (amount: number): string => `−${formatVnd(amount)}`;

/** Rows for a summary: without a promotion only "Tổng thanh toán" (or with `alwaysSubtotal`, Tạm tính too). */
export function summaryRows(totals: Totals, options: { totalLabel?: string; alwaysSubtotal?: boolean } = {}): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const promoted = totals.discount > 0 && !!totals.promotionName;
  if (promoted || options.alwaysSubtotal) rows.push({ key: "subtotal", label: "Tạm tính", value: formatVnd(totals.subtotal) });
  if (promoted) rows.push({ key: "promotion", label: `Khuyến mãi: ${totals.promotionName}`, value: discountText(totals.discount), tone: "success" });
  rows.push({ key: "total", label: options.totalLabel ?? "Tổng thanh toán", value: formatVnd(totals.total), strong: true });
  return rows;
}

/** An order (or Chi tiêu purchase) as summary totals; older orders without the fields have no promotion. */
export const orderTotals = (order: { total: number; subtotal?: number; promotionName?: string | null; discountAmount?: number }): Totals => ({
  subtotal: order.subtotal && order.subtotal > 0 ? order.subtotal : order.total,
  discount: order.discountAmount ?? 0,
  promotionName: order.promotionName ?? null,
  total: order.total,
});

/** A preview from the server as summary totals. */
export const previewTotals = (preview: { subtotal: number; discount: number; total: number; promotion: { name: string } | null }): Totals => ({
  subtotal: preview.subtotal, discount: preview.discount, promotionName: preview.promotion?.name ?? null, total: preview.total,
});

/**
 * Giỏ hàng summary, the same rows as the checkout sheet: "Tạm tính", "Khuyến mãi: <tên> −X" (only when a promotion
 * applies) and "Tổng thanh toán" (the discounted total, bold), plus the "Mua thêm … để được …" hint. Until the
 * server's preview arrives (or when it fails), the cart's own total: Tạm tính = Tổng thanh toán, no promotion.
 */
export function cartSummary(
  preview: { subtotal: number; discount: number; total: number; promotion: { name: string } | null; hint: { text: string } | null } | null,
  cartTotal: number,
): { rows: SummaryRow[]; hint: string | null } {
  const shown = preview ?? { subtotal: cartTotal, discount: 0, total: cartTotal, promotion: null, hint: null };
  return { rows: summaryRows(previewTotals(shown), { alwaysSubtotal: true }), hint: shown.hint?.text ?? null };
}

/** The checkout sheet notice when "Đặt hàng" found a different total. */
export const totalChangedText = (before: number, after: number): string =>
  `Tổng thanh toán đã thay đổi từ ${formatVnd(before)} thành ${formatVnd(after)}. Kiểm tra lại rồi bấm Đặt hàng.`;
