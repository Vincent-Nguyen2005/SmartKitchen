import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Clock, Inbox, Info, ShoppingCart, Tag } from "lucide-react-native";
import { errorMessage, query, type Page } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { AppIcon, spacing, type LucideIcon } from "../../theme";
import { useSession } from "../../services/session";
import { inventoryApi, type ExpiringInventoryItem } from "../inventory/inventoryApi";
import { colors, EmptyState, RemoteImage, ScreenState, styles, useLayout } from "./ui";
import { discountLabel, itemName, PromotionDetail, type Promotion } from "./PromotionDetail";

export type AppNotification = {
  id: string;
  type: "PROMOTION" | "EXPIRY_ALERT" | "SHOPPING_REMINDER" | "SYSTEM";
  title: string;
  body: string;
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  createdAt: string;
  readAt: string | null;
  /** Promotion notifications carry { promotionId }. */
  data?: { promotionId?: string } | null;
};

/** Same rule as the old Kho card: expired, or expiring within the next 3 days (inventory alerts API). */
export const EXPIRY_ALERT_DAYS = 3;
const PAGE_SIZE = 20;
const PROMOTION_LIMIT = 50;
const typeLabel: Record<AppNotification["type"], string> = {
  PROMOTION: "Khuyến mãi",
  EXPIRY_ALERT: "Sắp hết hạn",
  SHOPPING_REMINDER: "Nhắc đi chợ",
  SYSTEM: "Hệ thống",
};
const typeIcon: Record<AppNotification["type"], LucideIcon> = {
  PROMOTION: Tag,
  EXPIRY_ALERT: Clock,
  SHOPPING_REMINDER: ShoppingCart,
  SYSTEM: Info,
};

const pad = (value: number) => String(value).padStart(2, "0");
/** dd/mm/yyyy in the device's calendar. */
const fullDay = (iso: string) => { const date = new Date(iso); return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`; };
/** dd/mm of a stored expiry day (the API returns YYYY-MM-DDT00:00:00.000Z). */
const expiryDay = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** "Sữa tươi hết hạn sau 2 ngày (22/11)", "… hết hạn hôm nay (20/11)", "Trứng đã hết hạn (19/11)". */
export const expiryText = (item: ExpiringInventoryItem): string => {
  const day = expiryDay(item.expiryDate);
  if (item.daysLeft < 0) return `${item.name} đã hết hạn (${day})`;
  if (item.daysLeft === 0) return `${item.name} hết hạn hôm nay (${day})`;
  return `${item.name} hết hạn sau ${item.daysLeft} ngày (${day})`;
};

/** "<name> giảm X%" for ingredient promotions; partner wording ("Mua 1 tặng 1") stays as the title. */
const promotionTitle = (promotion: Promotion): string => {
  const label = discountLabel(promotion.discountInfo);
  return label?.startsWith("Giảm ") ? `${itemName(promotion.title)} ${label.toLowerCase()}` : promotion.title;
};

type FeedEntry =
  | { kind: "week"; key: string; count: number }
  | { kind: "expiry"; key: string; item: ExpiringInventoryItem }
  | { kind: "notification"; key: string; item: AppNotification }
  | { kind: "promotion"; key: string; item: Promotion };

type Props = {
  /** Expiry card tapped: open Kho with that item's edit dialog. */
  onOpenInventoryItem?: (itemId: string) => void;
  /** Something that affects the tab badge changed (loaded, refreshed, marked read). */
  onChanged?: () => void;
  /** "Tuần này còn thiếu N nguyên liệu" tapped: open "Cần mua tuần này". */
  onOpenWeekShopping?: () => void;
};

/**
 * Thông báo: one list mixing notifications, expiry alerts (inventory alerts API, client side; no service stores
 * them) and active promotions, in the same card style. Most urgent first: expiry alerts (soonest first), then
 * unread notifications, then the rest newest first. A promotion that already has a notification is shown once.
 */
export default function NotificationFeed({ onOpenInventoryItem, onChanged, onOpenWeekShopping }: Props): React.JSX.Element {
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Promotion | null>(null);
  const requestId = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const load = useCallback(async (refresh: boolean) => {
    // userId is not sent: the gateway derives identity from the access token. It is only a reload trigger.
    if (!userId) return;
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    const [notificationResult, promotionResult, expiringResult, weekResult] = await Promise.allSettled([
      api.get<Page<AppNotification>>(`/api/notifications/notifications${query({ page: 1, limit: PAGE_SIZE })}`),
      api.get<Page<Promotion>>(`/api/notifications/promotions${query({ active: true, page: 1, limit: PROMOTION_LIMIT })}`),
      accessToken && family?.id ? inventoryApi.expiring(accessToken, family.id, EXPIRY_ALERT_DAYS) : Promise.resolve(null),
      family?.id ? api.get<{ count: number }>("/api/menus/week-missing") : Promise.resolve({ count: 0 }),
    ]);
    if (id !== requestId.current) return; // a newer request replaced this one
    if (notificationResult.status === "fulfilled") {
      setNotifications(notificationResult.value.items);
      setNotificationTotal(notificationResult.value.total);
      setPage(1);
    }
    if (promotionResult.status === "fulfilled") setPromotions(promotionResult.value.items);
    if (expiringResult.status === "fulfilled") setExpiring(expiringResult.value?.items ?? []);
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
    const alerts: FeedEntry[] = [...expiring]
      .sort((first, second) => first.daysLeft - second.daysLeft)
      .map((item) => ({ kind: "expiry", key: `expiry-${item.id}`, item }));
    const unread = notifications.filter((item) => item.status !== "READ").map<FeedEntry>((item) => ({ kind: "notification", key: item.id, item }));
    const rest = [
      ...notifications.filter((item) => item.status === "READ").map((item) => ({ entry: { kind: "notification", key: item.id, item } as FeedEntry, at: item.createdAt })),
      ...promotions.filter((item) => !notifiedPromotions.has(item.id)).map((item) => ({ entry: { kind: "promotion", key: `promotion-${item.id}`, item } as FeedEntry, at: item.startsAt })),
    ].sort((first, second) => second.at.localeCompare(first.at)).map(({ entry }) => entry);
    // One "Tuần này còn thiếu" item at the top when something is missing; none when N = 0.
    const week: FeedEntry[] = weekMissing > 0 ? [{ kind: "week", key: "week-missing", count: weekMissing }] : [];
    return [...week, ...alerts, ...unread, ...rest];
  }, [notifications, promotions, expiring, weekMissing]);

  const openNotification = (item: AppNotification) => {
    void markRead(item);
    const promotion = item.data?.promotionId ? promotions.find((entry) => entry.id === item.data?.promotionId) : undefined;
    if (promotion) setSelected(promotion);
  };

  const renderEntry = ({ item: entry }: { item: FeedEntry }) => {
    if (entry.kind === "week") {
      const text = `Tuần này còn thiếu ${entry.count} nguyên liệu`;
      return (
        <FeedCard
          icon={<AppIcon icon={ShoppingCart} color={colors.primary} />}
          meta="Thực đơn tuần · Cần mua"
          title={text}
          accessibilityLabel={`${text}. Chạm để xem danh sách cần mua`}
          onPress={() => onOpenWeekShopping?.()}
        />
      );
    }
    if (entry.kind === "expiry") {
      const text = expiryText(entry.item);
      return (
        <FeedCard
          icon={<AppIcon icon={Clock} color={colors.primary} />}
          meta="Hạn dùng · Kho"
          title={text}
          accessibilityLabel={`${text}. Chạm để mở trong Kho`}
          onPress={() => onOpenInventoryItem?.(entry.item.id)}
        />
      );
    }
    if (entry.kind === "promotion") {
      const title = promotionTitle(entry.item);
      return (
        <FeedCard
          icon={<RemoteImage uri={entry.item.imageUrl} size={40} placeholderIcon={Tag} />}
          meta={`Khuyến mãi · đến ${fullDay(entry.item.endsAt)}`}
          title={title}
          accessibilityLabel={`Khuyến mãi: ${title}, đến ${fullDay(entry.item.endsAt)}. Chạm để xem chi tiết`}
          onPress={() => setSelected(entry.item)}
        />
      );
    }
    const item = entry.item;
    const unread = item.status !== "READ";
    return (
      <FeedCard
        icon={<AppIcon icon={typeIcon[item.type]} color={colors.primary} />}
        meta={`${typeLabel[item.type]} · ${new Date(item.createdAt).toLocaleString("vi-VN")}`}
        title={item.title}
        body={item.body}
        unread={unread}
        accessibilityLabel={`${unread ? "Chưa đọc. " : ""}${item.title}. ${item.body}`}
        onPress={() => openNotification(item)}
      />
    );
  };

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      {loading ? (
        <ScreenState loading />
      ) : error && entries.length === 0 ? (
        <ScreenState error={error} onRetry={() => void load(false)} />
      ) : (
        <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          data={entries}
          keyExtractor={(entry) => entry.key}
          renderItem={renderEntry}
          contentContainerStyle={[local.listContent, isWide && local.wide, entries.length === 0 && local.listFill]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListEmptyComponent={<EmptyState fill icon={Inbox} text="Bạn chưa có thông báo nào." />}
          ListFooterComponent={loadingMore ? <ScreenState loading /> : error ? <Text style={styles.errorText}>{error}</Text> : undefined}
        />
      )}
      <PromotionDetail promotion={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

type FeedCardProps = {
  icon: React.ReactNode;
  meta: string;
  title: string;
  body?: string;
  unread?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

/** One card style for every entry: icon or image, meta line, title (bold + dot when unread), optional body. */
function FeedCard({ icon, meta, title, body, unread = false, accessibilityLabel, onPress }: FeedCardProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, local.card, pressed && styles.pressed]}
    >
      <View style={local.iconWrap}>{icon}</View>
      <View style={local.content}>
        <View style={styles.row}>
          <Text style={[styles.caption, local.meta]} numberOfLines={1}>{meta}</Text>
          {unread ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={local.dot} /> : null}
        </View>
        <Text style={[styles.subtitle, unread ? local.titleUnread : local.titleRead]}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
    </Pressable>
  );
}

const local = StyleSheet.create({
  listContent: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.md },
  listFill: { flexGrow: 1 },
  wide: { alignSelf: "center", maxWidth: 920, width: "100%" },
  card: { flexDirection: "row", gap: spacing.md },
  iconWrap: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 40, justifyContent: "center", overflow: "hidden", width: 40 },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  meta: { flex: 1 },
  dot: { backgroundColor: colors.primary, borderRadius: 5, height: 10, width: 10 },
  titleUnread: { fontWeight: "700" },
  titleRead: { fontWeight: "500" },
});
