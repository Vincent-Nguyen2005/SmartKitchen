import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { errorMessage, query, type Page } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { colors, ScreenState, Segmented, styles, useLayout } from "./ui";

export type AppNotification = {
  id: string;
  type: "PROMOTION" | "EXPIRY_ALERT" | "SHOPPING_REMINDER" | "SYSTEM";
  title: string;
  body: string;
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  createdAt: string;
  readAt: string | null;
};

const PAGE_SIZE = 20;
const typeLabel: Record<AppNotification["type"], string> = {
  PROMOTION: "Khuyến mãi",
  EXPIRY_ALERT: "Sắp hết hạn",
  SHOPPING_REMINDER: "Nhắc đi chợ",
  SYSTEM: "Hệ thống",
};

export default function NotificationListScreen(): React.JSX.Element {
  const { api, userId } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage: number, mode: "initial" | "refresh" | "more") => {
    if (!userId) return;
    const id = ++requestId.current;
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    if (mode === "more") setLoadingMore(true);
    try {
      const result = await api.get<Page<AppNotification>>(`/api/notifications/notifications${query({ userId, page: nextPage, limit: PAGE_SIZE, status: filter === "unread" ? "SENT" : undefined })}`);
      if (id !== requestId.current) return; // a newer request replaced this one
      setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [api, filter, userId]);

  useEffect(() => { void load(1, "initial"); }, [load]);

  const markRead = async (item: AppNotification) => {
    if (item.status === "READ") return;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "READ" } : entry)));
    try {
      await api.patch(`/api/notifications/notifications/${encodeURIComponent(item.id)}/read`);
    } catch (caught) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setError(errorMessage(caught));
    }
  };

  const unreadCount = items.filter((item) => item.status !== "READ").length;

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      <Segmented<"all" | "unread">
        label="Lọc thông báo"
        value={filter}
        onChange={setFilter}
        options={[{ value: "all", label: "Tất cả" }, { value: "unread", label: `Chưa đọc${unreadCount ? ` (${unreadCount})` : ""}` }]}
      />
      {loading || (error && items.length === 0) ? (
        <ScreenState loading={loading} error={error} onRetry={() => void load(1, "initial")} />
      ) : (
        <FlatList
          data={items}
          key={isWide ? "wide" : "narrow"}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? { gap: 12 } : undefined}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, "refresh")} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (!loadingMore && items.length < total) void load(page + 1, "more"); }}
          ListEmptyComponent={<ScreenState empty emptyText={filter === "unread" ? "Không có thông báo chưa đọc." : "Bạn chưa có thông báo nào."} />}
          ListFooterComponent={loadingMore ? <ScreenState loading /> : error ? <Text style={styles.errorText}>{error}</Text> : null}
          renderItem={({ item }) => {
            const unread = item.status !== "READ";
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${unread ? "Chưa đọc. " : ""}${item.title}. ${item.body}`}
                accessibilityHint={unread ? "Chạm để đánh dấu đã đọc" : undefined}
                onPress={() => void markRead(item)}
                style={[styles.card, { flex: 1 }, unread && { backgroundColor: colors.unread, borderColor: colors.primary }]}
              >
                <View style={styles.row}>
                  {unread ? <View accessibilityElementsHidden style={{ backgroundColor: colors.primary, borderRadius: 4, height: 8, width: 8 }} /> : null}
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{typeLabel[item.type]} · {new Date(item.createdAt).toLocaleString("vi-VN")}</Text>
                </View>
                <Text style={[styles.title, { fontSize: 16, marginTop: 4, fontWeight: unread ? "700" : "500" }]}>{item.title}</Text>
                <Text style={{ color: colors.text, marginTop: 4 }}>{item.body}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
