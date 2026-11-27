/**
 * Thông báo multi-select and dismissals (pure, no React Native; covered by feedSelection.test.ts). The selection state
 * itself is the Đi chợ reducer (shopping-cart/selection.ts: long press starts, taps toggle, ✕ / back / empty space /
 * tab change exit), keyed by feed entry keys.
 *
 * "Xóa" on a selection:
 * - stored rows (orders, promotion rows, system notices) → POST /api/notifications/notifications/delete { ids }:
 *   deleted for this user only;
 * - computed items (no row anywhere) → POST /api/notifications/notifications/dismissals { keys }, with keys that carry
 *   the item's state, so the item comes back by itself when that state changes:
 *     "Tuần này còn thiếu"   week:<Monday of this Vietnam week>            → back next week
 *     expiry alert           expiry:<itemId>:<expiry day>:<stage>          → back at the next stage or a new date
 *                            (stage: "3-ngay" / "2-ngay" / "1-ngay" / "hom-nay" / "het-han")
 *     active promotion       promotion:<promotionId>                       → gone for good
 */

export type FeedKind = "week" | "expiry" | "notification" | "promotion";

/** The fields of an expiry alert used here (inventory alerts API rows). */
export type ExpiryAlertLike = {
  id: string;
  name: string;
  quantity: number;
  expiryDate: string | null;
  status: string;
  daysLeft: number;
  deliveryOrderId?: string | null;
};

export type SelectableEntry =
  | { kind: "week"; key: string; weekStart: string }
  | { kind: "expiry"; key: string; item: ExpiryAlertLike }
  | { kind: "notification"; key: string; item: { id: string } }
  | { kind: "promotion"; key: string; item: { id: string } };

const VN_OFFSET_MS = 7 * 3_600_000;

/** Monday (YYYY-MM-DD) of the current week in Vietnam. */
export function vietnamWeekStart(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const weekday = (vn.getUTCDay() + 6) % 7; // Monday = 0
  vn.setUTCDate(vn.getUTCDate() - weekday);
  return vn.toISOString().slice(0, 10);
}

/** The alert's stage: the wording changes with it ("sau 2 ngày", "hôm nay", "đã hết hạn"). */
export function expiryStage(daysLeft: number): string {
  if (daysLeft < 0) return "het-han";
  if (daysLeft === 0) return "hom-nay";
  return `${daysLeft}-ngay`;
}

export const weekDismissKey = (weekStart: string): string => `week:${weekStart}`;
export const expiryDismissKey = (item: Pick<ExpiryAlertLike, "id" | "expiryDate" | "daysLeft">): string =>
  `expiry:${item.id}:${item.expiryDate ? item.expiryDate.slice(0, 10) : "none"}:${expiryStage(item.daysLeft)}`;
export const promotionDismissKey = (promotionId: string): string => `promotion:${promotionId}`;

/** The dismissal key of a computed entry; null for stored rows (they are deleted instead). */
export function dismissKey(entry: SelectableEntry): string | null {
  switch (entry.kind) {
    case "week": return weekDismissKey(entry.weekStart);
    case "expiry": return expiryDismissKey(entry.item);
    case "promotion": return promotionDismissKey(entry.item.id);
    default: return null;
  }
}

/** The selected feed keys → stored notification ids to delete and dismissal keys to store. Unknown keys are skipped. */
export function splitSelection(selectedKeys: readonly string[], entries: readonly SelectableEntry[]): { notificationIds: string[]; dismissKeys: string[] } {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const notificationIds: string[] = [];
  const dismissKeys: string[] = [];
  for (const key of selectedKeys) {
    const entry = byKey.get(key);
    if (!entry) continue;
    if (entry.kind === "notification") notificationIds.push(entry.item.id);
    else dismissKeys.push(dismissKey(entry) as string);
  }
  return { notificationIds, dismissKeys };
}

/** Feed entries without the dismissed computed ones (stored rows are never filtered here). */
export function withoutDismissed<T extends SelectableEntry>(entries: readonly T[], dismissed: ReadonlySet<string>): T[] {
  return entries.filter((entry) => {
    const key = dismissKey(entry);
    return key === null || !dismissed.has(key);
  });
}

/** "Xóa 3 thông báo?" */
export const deleteConfirmTitle = (count: number): string => `Xóa ${count} thông báo?`;

/**
 * Expiry alerts the feed shows: still in Kho with something left. The inventory alerts API already leaves out
 * consumed (quantity 0 / CONSUMED), discarded, deleted, "Đang giao" and auto-hidden bought rows; this repeats the
 * per-row part so an item that changed in Kho meanwhile never shows.
 */
export function visibleExpiryAlerts<T extends ExpiryAlertLike>(items: readonly T[]): T[] {
  return items.filter((item) => item.quantity > 0 && !item.deliveryOrderId && item.expiryDate !== null && item.status !== "CONSUMED" && item.status !== "DISCARDED");
}

/** dd/MM of a stored expiry day (the API returns YYYY-MM-DDT00:00:00.000Z). */
const expiryDay = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** "Sữa tươi hết hạn sau 2 ngày (22/11)", "Sữa tươi hết hạn hôm nay", "Trứng đã hết hạn 3 ngày". */
export function expiryText(item: Pick<ExpiryAlertLike, "name" | "expiryDate" | "daysLeft">): string {
  if (item.daysLeft < 0) return `${item.name} đã hết hạn ${-item.daysLeft} ngày`;
  if (item.daysLeft === 0) return `${item.name} hết hạn hôm nay`;
  return `${item.name} hết hạn sau ${item.daysLeft} ngày (${expiryDay(item.expiryDate)})`;
}

/** Where a tapped order notice (or order push) goes: Đi chợ › Đơn hàng with this order highlighted. */
export function orderTarget(data: unknown): { orderId: string } | null {
  const value = data as { type?: unknown; orderId?: unknown } | null | undefined;
  return value?.type === "order" && typeof value.orderId === "string" && value.orderId ? { orderId: value.orderId } : null;
}
