import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { errorMessage, query, type Page } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { colors, Field, ScreenState, styles, useLayout } from "./ui";

type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discountInfo: string | null;
  productKeywords: string[];
  startsAt: string;
  endsAt: string;
};

const PAGE_SIZE = 20;

export default function PromotionsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter } = useLayout();
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Promotion[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce the search box so typing does not send one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (nextPage: number, refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else if (nextPage === 1) setLoading(true);
    try {
      const result = await api.get<Page<Promotion>>(`/api/notifications/promotions${query({ active: true, keyword, page: nextPage, limit: PAGE_SIZE })}`);
      if (id !== requestId.current) return;
      setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [api, keyword]);

  useEffect(() => { void load(1); }, [load]);

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter, paddingTop: 8 }]}>
      <Field label="Tìm khuyến mãi" placeholder="Ví dụ: cà chua" value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} />
      {loading || (error && items.length === 0) ? (
        <ScreenState loading={loading} error={error} onRetry={() => void load(1)} />
      ) : (
        <FlatList
          data={items}
          key={`cols-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (items.length < total) void load(page + 1); }}
          ListEmptyComponent={<ScreenState empty emptyText={keyword ? `Không có khuyến mãi cho "${keyword}".` : "Hiện chưa có khuyến mãi."} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { flex: 1 }]} accessible accessibilityLabel={`${item.title}. ${item.discountInfo ?? ""}. Hết hạn ${new Date(item.endsAt).toLocaleDateString("vi-VN")}`}>
              <Text style={styles.title}>{item.title}</Text>
              {item.discountInfo ? <Text style={{ color: colors.success, fontWeight: "600", marginTop: 4 }}>{item.discountInfo}</Text> : null}
              {item.description ? <Text style={{ color: colors.text, marginTop: 4 }}>{item.description}</Text> : null}
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>
                {new Date(item.startsAt).toLocaleDateString("vi-VN")} – {new Date(item.endsAt).toLocaleDateString("vi-VN")}
              </Text>
              {item.productKeywords.length ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{item.productKeywords.join(" · ")}</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
