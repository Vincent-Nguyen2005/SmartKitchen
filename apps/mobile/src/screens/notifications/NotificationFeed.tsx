import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Check, Clock, Inbox, Info, ShoppingCart, Tag, Truck } from "lucide-react-native";
import { notificationCategory, type CategoryIcon } from "./notificationCategory";
import { errorMessage, query, type Page } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { AppIcon, spacing, type LucideIcon } from "../../theme";
import { useSession } from "../../services/session";
import { useConfirm } from "../../components/ConfirmDialog";
import { inventoryApi, type ExpiringInventoryItem } from "../inventory/inventoryApi";
import { NO_SELECTION, selectionReducer, tapIntent } from "../shopping-cart/selection";
import { colors, EmptyState, RemoteImage, ScreenState, styles, useLayout } from "./ui";
import { discountLabel, itemName, PromotionDetail, type Promotion } from "./PromotionDetail";
import {
  deleteConfirmTitle,
  expiryText,
  orderTarget,
  promotionDismissKey,
  splitSelection,
  visibleExpiryAlerts,
  vietnamWeekStart,
  withoutDismissed,
} from "./feedSelection";
import { notificationSelectionBar } from "./selectionStore";

export type AppNotification = {
  id: string;
  type: "PROMOTION" | "EXPIRY_ALERT" | "SHOPPING_REMINDER" | "SYSTEM";
  title: string;
  body: string;
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  createdAt: string;
  readAt: string | null;
  /** Promotion notifications carry { promotionId }; order notices { type: "order", orderId, status }. */
  data?: { promotionId?: string; type?: string; orderId?: string } | null;
};

/** Same rule as the old Kho card: expired, or expiring within the next 3 days (inventory alerts API). */
export const EXPIRY_ALERT_DAYS = 3;
const PAGE_SIZE = 20;
const PROMOTION_LIMIT = 50;
/** Category icons (labels and the choice in notificationCategory.ts; order notices: "Đơn hàng" + truck). */
const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = { tag: Tag, clock: Clock, cart: ShoppingCart, info: Info, truck: Truck };

const pad = (value: number) => String(value).padStart(2, "0");
/** dd/mm/yyyy in the device's calendar. */
const fullDay = (iso: string) => { const date = new Date(iso); return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`; };

/** "<name> giảm X%" for ingredient promotions; partner wording ("Mua 1 tặng 1") stays as the title. */
const promotionTitle = (promotion: Promotion): string => {
  const label = discountLabel(promotion.discountInfo);
  return label?.startsWith("Giảm ") ? `${itemName(promotion.title)} ${label.toLowerCase()}` : promotion.title;
};

type FeedEntry =
  | { kind: "week"; key: string; count: number; weekStart: string }
  | { kind: "expiry"; key: string; item: ExpiringInventoryItem }
  | { kind: "notification"; key: string; item: AppNotification }
  | { kind: "promotion"; key: string; item: Promotion };

type Props = {
  /** Expiry card tapped: open Kho with that item's edit dialog. */
  onOpenInventoryItem?: (itemId: string) => void;
  /** Something that affects the tab badge changed (loaded, refreshed, marked read, deleted). */
  onChanged?: () => void;
  /** "Tuần này còn thiếu N nguyên liệu" tapped: open "Cần mua tuần này". */
  onOpenWeekShopping?: () => void;
  /** An order notice tapped: open Đi chợ › Đơn hàng on that order. */
  onOpenOrder?: (orderId: string) => void;
};

/**
 * Thông báo: one list mixing notifications, expiry alerts (inventory alerts API, client side; no service stores
 * them) and active promotions, in the same card style. Most urgent first: expiry alerts (soonest first), then
 * unread notifications, then the rest newest first. A promotion that already has a notification is shown once.
 *
 * Multi-select like Đi chợ (feedSelection.ts): long press → check marks, taps toggle, the bottom bar shows
 * "✕ · N đã chọn · Xóa"; ✕, Android back, a tap on empty space and leaving the tab end it. "Xóa" deletes stored rows
 * for this user and dismisses computed items (server-side, so it holds on every device).
 */
export default function NotificationFeed({ onOpenInventoryItem, onChanged, onOpenWeekShopping, onOpenOrder }: Props): React.JSX.Element {
  const { api, userId } = useGatewayApi();
  const { accessToken, family } = useSession();
  const { gutter, isWide } = useLayout();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [expiring, setExpiring] = useState<ExpiringInventoryItem[]>([]);
  // Missing ingredients for this week's menus (computed on read by menu-service; nothing is stored or pushed).
  const [weekMissing, setWeekMissing] = useState(0);
  // Dismissed computed items (week / expiry / promotion keys, see feedSelection.ts).
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Promotion | null>(null);
  const [selection, dispatchSelection] = useReducer(selectionReducer, NO_SELECTION);
  const { confirm, dialog } = useConfirm();
  const requestId = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const load = useCallback(async (refresh: boolean) => {
    // userId is not sent: the gateway derives identity from the access token. It is only a reload trigger.
    if (!userId) return;
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [notificationResult, promotionResult, expiringResult, weekResult, dismissedResult] = await Promise.allSettled([
      api.get<Page<AppNotification>>(`/api/notifications/notifications${query({ page: 1, limit: PAGE_SIZE })}`),
      api.get<Page<Promotion>>(`/api/notifications/promotions${query({ active: true, page: 1, limit: PROMOTION_LIMIT })}`),
      accessToken && family?.id ? inventoryApi.expiring(accessToken, family.id, EXPIRY_ALERT_DAYS) : Promise.resolve(null),
      family?.id ? api.get<{ count: number }>("/api/menus/week-missing") : Promise.resolve({ count: 0 }),
      api.get<{ keys: string[] }>("/api/notifications/notifications/dismissals"),
    ]);
    if (id !== requestId.current) return; // a newer request replaced this one
    if (notificationResult.status === "fulfilled") {
      setNotifications(notificationResult.value.items);
      setNotificationTotal(notificationResult.value.total);
      setPage(1);
    }
    if (promotionResult.status === "fulfilled") setPromotions(promotionResult.value.items);
    if (expiringResult.status === "fulfilled") setExpiring(expiringResult.value?.items ?? []);
    if (dismissedResult.status === "fulfilled") setDismissed(new Set(dismissedResult.value.keys));
    // A failed check just hides the item (no error banner for it).
    setWeekMissing(weekResult.status === "fulfilled" ? weekResult.value.count : 0);
    const failure = [notificationResult, promotionResult, expiringResult].find((result) => result.status === "rejected");
    setError(failure && failure.status === "rejected" ? errorMessage(failure.reason) : null);
    setLoading(false);
    setRefreshing(false);
    changed.current?.();
  }, [api, userId, accessToken, family?.id]);

  useEffect(() => { void load(false); }, [load]);

  const loadMore = async () => {
    if (loadingMore || notifications.length >= notificationTotal) return;
    setLoadingMore(true);
    try {
      const next = await api.get<Page<AppNotification>>(`/api/notifications/notifications${query({ page: page + 1, limit: PAGE_SIZE })}`);
      setNotifications((current) => [...current, ...next.items.filter((item) => !current.some((entry) => entry.id === item.id))]);
      setNotificationTotal(next.total);
      setPage(page + 1);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (item: AppNotification) => {
    if (item.status === "READ") return;
    setNotifications((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "READ" } : entry)));
    try {
      await api.patch(`/api/notifications/notifications/${encodeURIComponent(item.id)}/read`);
      changed.current?.();
    } catch (caught) {
      setNotifications((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setError(errorMessage(caught));
    }
  };

  const entries = useMemo<FeedEntry[]>(() => {
    const notifiedPromotions = new Set(notifications.map((item) => item.data?.promotionId).filter((value): value is string => Boolean(value)));
    const alerts: FeedEntry[] = visibleExpiryAlerts(expiring)
      .sort((first, second) => first.daysLeft - second.daysLeft)
      .map((item) => ({ kind: "expiry", key: `expiry-${item.id}`, item }));
    const unread = notifications.filter((item) => item.status !== "READ").map<FeedEntry>((item) => ({ kind: "notification", key: item.id, item }));
    const rest = [
      ...notifications.filter((item) => item.status === "READ").map((item) => ({ entry: { kind: "notification", key: item.id, item } as FeedEntry, at: item.createdAt })),
      ...promotions.filter((item) => !notifiedPromotions.has(item.id)).map((item) => ({ entry: { kind: "promotion", key: `promotion-${item.id}`, item } as FeedEntry, at: item.startsAt })),
    ].sort((first, second) => second.at.localeCompare(first.at)).map(({ entry }) => entry);
    // One "Tuần này còn thiếu" item at the top when something is missing; none when N = 0.
    const week: FeedEntry[] = weekMissing > 0 ? [{ kind: "week", key: "week-missing", count: weekMissing, weekStart: vietnamWeekStart() }] : [];
    return withoutDismissed([...week, ...alerts, ...unread, ...rest], dismissed);
  }, [notifications, promotions, expiring, weekMissing, dismissed]);

  // ---- Selection mode ----
  const exitSelection = useCallback(() => dispatchSelection({ type: "exit" }), []);
  const selectedSet = useMemo(() => new Set(selection.ids), [selection.ids]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // Rows that disappeared (refresh, deleted elsewhere) leave the selection.
  useEffect(() => {
    if (!selection.active) return;
    const keys = new Set(entries.map((entry) => entry.key));
    for (const id of selection.ids) if (!keys.has(id)) dispatchSelection({ type: "tap", id });
  }, [entries, selection.active, selection.ids]);
  useEffect(() => {
    if (!selection.active) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { if (!deleting) exitSelection(); return true; });
    return () => subscription.remove();
  }, [selection.active, deleting, exitSelection]);

  const deleteSelection = async () => {
    const keys = selectionRef.current.ids;
    if (keys.length === 0 || deleting) return;
    const ok = await confirm({ title: deleteConfirmTitle(keys.length), cancelLabel: "Hủy", confirmLabel: "Xóa", destructive: true });
    if (!ok) return;
    const { notificationIds, dismissKeys } = splitSelection(keys, entries);
    const removedIds = new Set(notificationIds);
    // A deleted promotion row must not come back as the plain promotion card either (the server stores the same key).
    const promotionKeys = notifications.filter((item) => removedIds.has(item.id) && item.data?.promotionId).map((item) => promotionDismissKey(item.data?.promotionId as string));
    setDeleting(true);
    try {
      await Promise.all([
        notificationIds.length > 0 ? api.post("/api/notifications/notifications/delete", { ids: notificationIds }) : Promise.resolve(null),
        dismissKeys.length > 0 ? api.post("/api/notifications/notifications/dismissals", { keys: dismissKeys }) : Promise.resolve(null),
      ]);
      setNotifications((current) => current.filter((item) => !removedIds.has(item.id)));
      setNotificationTotal((total) => Math.max(0, total - removedIds.size));
      setDismissed((current) => new Set([...current, ...dismissKeys, ...promotionKeys]));
      setError(null);
      exitSelection();
      changed.current?.(); // bell badge
    } catch (caught) {
      setError(errorMessage(caught));
      void load(true);
    } finally {
      setDeleting(false);
    }
  };

  // App.tsx shows "✕ · N đã chọn · Xóa" from this store (in place of the bottom area); leaving the tab unmounts → cleared.
  const deleteRef = useRef(deleteSelection);
  deleteRef.current = deleteSelection;
  useEffect(() => {
    if (!selection.active) { notificationSelectionBar.clear(); return; }
    notificationSelectionBar.publish(
      { active: true, count: selection.ids.length, busy: deleting, canAdd: selection.ids.length > 0 && !deleting },
      { onExit: exitSelection, onAdd: () => { void deleteRef.current(); } },
    );
  }, [selection.active, selection.ids.length, deleting, exitSelection]);
  useEffect(() => () => notificationSelectionBar.clear(), []);

  // ---- Opening entries (outside selection mode) ----
  const openEntry = (entry: FeedEntry) => {
    if (entry.kind === "week") { onOpenWeekShopping?.(); return; }
    if (entry.kind === "expiry") { onOpenInventoryItem?.(entry.item.id); return; }
    if (entry.kind === "promotion") { setSelected(entry.item); return; }
    const item = entry.item;
    void markRead(item);
    const order = orderTarget(item.data);
    if (order) { onOpenOrder?.(order.orderId); return; }
    const promotion = item.data?.promotionId ? promotions.find((candidate) => candidate.id === item.data?.promotionId) : undefined;
    if (promotion) setSelected(promotion);
  };
  const openRef = useRef(openEntry);
  openRef.current = openEntry;
  // The same two callbacks for every row (they read state from refs), so a toggle re-renders only the toggled row.
  const pressEntry = useCallback((entry: FeedEntry) => {
    if (tapIntent(selectionRef.current) === "toggle") dispatchSelection({ type: "tap", id: entry.key });
    else openRef.current(entry);
  }, []);
  const longPressEntry = useCallback((entry: FeedEntry) => dispatchSelection({ type: "longPress", id: entry.key }), []);

  const renderEntry = useCallback(
    ({ item: entry }: { item: FeedEntry }) => (
      <FeedRow entry={entry} selected={selection.active ? selectedSet.has(entry.key) : undefined} onPress={pressEntry} onLongPress={longPressEntry} />
    ),
    [selection.active, selectedSet, pressEntry, longPressEntry],
  );

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      {loading ? (
        <ScreenState loading />
      ) : error && entries.length === 0 ? (
        <ScreenState error={error} onRetry={() => void load(false)} />
      ) : (
        // A tap on empty space (not on a card) leaves selection mode, as in Đi chợ.
        <Pressable accessible={false} onPress={selection.active && !deleting ? exitSelection : undefined} style={local.listArea}>
          <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
            data={entries}
            extraData={selectedSet}
            keyExtractor={(entry) => entry.key}
            renderItem={renderEntry}
            contentContainerStyle={[local.listContent, isWide && local.wide, local.listFill]}
            refreshControl={<RefreshControl refreshing={refreshing} enabled={!selection.active} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            ListEmptyComponent={<EmptyState fill icon={Inbox} text="Bạn chưa có thông báo nào." />}
            ListFooterComponent={loadingMore ? <ScreenState loading /> : error ? <Text style={styles.errorText}>{error}</Text> : undefined}
          />
        </Pressable>
      )}
      <PromotionDetail promotion={selected} onClose={() => setSelected(null)} />
      {dialog}
    </View>
  );
}

type FeedRowProps = {
  entry: FeedEntry;
  /** undefined = not in selection mode; true / false = selected or not. */
  selected: boolean | undefined;
  onPress: (entry: FeedEntry) => void;
  onLongPress: (entry: FeedEntry) => void;
};

/** One feed entry as a card. Memoized: a selection toggle re-renders only the row whose `selected` changed. */
const FeedRow = memo(function FeedRow({ entry, selected, onPress, onLongPress }: FeedRowProps): React.JSX.Element {
  const common = { selected, onPress: () => onPress(entry), onLongPress: () => onLongPress(entry) };
  if (entry.kind === "week") {
    const text = `Tuần này còn thiếu ${entry.count} nguyên liệu`;
    return <FeedCard {...common} icon={<AppIcon icon={ShoppingCart} color={colors.primary} />} meta="Thực đơn tuần · Cần mua" title={text} accessibilityLabel={`${text}. Chạm để xem danh sách cần mua`} />;
  }
  if (entry.kind === "expiry") {
    const text = expiryText(entry.item);
    return <FeedCard {...common} icon={<AppIcon icon={Clock} color={colors.primary} />} meta="Hạn dùng · Kho" title={text} accessibilityLabel={`${text}. Chạm để mở trong Kho`} />;
  }
  if (entry.kind === "promotion") {
    const title = promotionTitle(entry.item);
    return (
      <FeedCard
        {...common}
        icon={<RemoteImage uri={entry.item.imageUrl} size={40} placeholderIcon={Tag} />}
        meta={`Khuyến mãi · đến ${fullDay(entry.item.endsAt)}`}
        title={title}
        accessibilityLabel={`Khuyến mãi: ${title}, đến ${fullDay(entry.item.endsAt)}. Chạm để xem chi tiết`}
      />
    );
  }
  const item = entry.item;
  const unread = item.status !== "READ";
  const category = notificationCategory(item);
  return (
    <FeedCard
      {...common}
      icon={<AppIcon icon={CATEGORY_ICONS[category.icon]} color={colors.primary} />}
      meta={`${category.label} · ${new Date(item.createdAt).toLocaleString("vi-VN")}`}
      title={item.title}
      body={item.body}
      unread={unread}
      accessibilityLabel={`${unread ? "Chưa đọc. " : ""}${item.title}. ${item.body}`}
    />
  );
});

type FeedCardProps = {
  icon: React.ReactNode;
  meta: string;
  title: string;
  body?: string;
  unread?: boolean;
  selected?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress: () => void;
};

/** One card style for every entry: icon or image, meta line, title (bold + dot when unread), optional body; a check in selection mode. */
function FeedCard({ icon, meta, title, body, unread = false, selected, accessibilityLabel, onPress, onLongPress }: FeedCardProps): React.JSX.Element {
  const selectable = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={selectable ? "checkbox" : "button"}
      accessibilityState={selectable ? { checked: selected } : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={selectable ? undefined : "Nhấn giữ để chọn nhiều"}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, local.card, selected && local.cardSelected, pressed && styles.pressed]}
    >
      <View style={local.iconWrap}>{icon}</View>
      <View style={local.content}>
        <View style={styles.row}>
          <Text style={[styles.caption, local.meta]} numberOfLines={1}>{meta}</Text>
          {unread && !selectable ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={local.dot} /> : null}
        </View>
        <Text style={[styles.subtitle, unread ? local.titleUnread : local.titleRead]}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {selectable ? (
        <View pointerEvents="none" style={[local.check, selected && local.checkOn]}>
          {selected ? <AppIcon icon={Check} size="sm" color={colors.primaryText} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const local = StyleSheet.create({
  listArea: { flex: 1 },
  listContent: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.md },
  listFill: { flexGrow: 1 },
  wide: { alignSelf: "center", maxWidth: 920, width: "100%" },
  card: { flexDirection: "row", gap: spacing.md },
  // Selected: the primary colour as a thicker border (same as Đi chợ cards; the card keeps its size).
  cardSelected: { borderColor: colors.primary, borderWidth: 2, margin: -1 },
  iconWrap: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 40, justifyContent: "center", overflow: "hidden", width: 40 },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  meta: { flex: 1 },
  dot: { backgroundColor: colors.primary, borderRadius: 5, height: 10, width: 10 },
  titleUnread: { fontWeight: "700" },
  titleRead: { fontWeight: "500" },
  check: { alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 2, height: 24, justifyContent: "center", width: 24 },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
