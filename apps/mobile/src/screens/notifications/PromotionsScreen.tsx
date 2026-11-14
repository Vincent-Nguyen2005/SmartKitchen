import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calendar, CircleCheck, CircleExclamationPoint, Search, SearchX, ShoppingCart, Tag, Tags, X } from "lucide-react-native";
import { errorMessage, query, type Page } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { AppIcon, AppText, IconButton } from "../../theme";
import { useSession } from "../../services/session";
// Existing shopping-list client (owner: Khanh); used as-is, not modified.
import { shoppingApi } from "../shopping-cart/shoppingApi";
import { Button, colors, Field, RemoteImage, ScreenState, styles, useGridCell, useLayout } from "./ui";

type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discountInfo: string | null;
  productKeywords: string[];
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
};

const PAGE_SIZE = 20;
const formatDay = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");
/** "20%" (admin ingredient promotions) reads "Giảm 20%"; partner text such as "Mua 1 tặng 1" is shown as-is. */
const discountLabel = (info: string | null): string | null => (!info ? null : /^\d{1,3}%$/.test(info.trim()) ? `Giảm ${info.trim()}` : info);
/** Shopping-list item name: admin promotions are titled "<ingredient> giảm X%". */
const itemName = (title: string): string => title.replace(/\s+giảm\s+\d{1,3}%$/i, "").trim() || title;

export default function PromotionsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter } = useLayout();
  const grid = useGridCell(columns);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Promotion[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Promotion | null>(null);
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
      <Field label="Tìm khuyến mãi" icon={Search} placeholder="Ví dụ: cà chua" value={search} onChangeText={setSearch} returnKeyType="search" autoCorrect={false} />
      {loading || (error && items.length === 0) ? (
        <ScreenState loading={loading} error={error} onRetry={() => void load(1)} />
      ) : (
        <FlatList
          data={items}
          key={`cols-${columns}`}
          numColumns={columns}
          onLayout={grid.onLayout}
          columnWrapperStyle={columns > 1 ? { gap: grid.gap } : undefined}
          keyExtractor={(item) => item.id}
          contentContainerStyle={local.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (items.length < total) void load(page + 1); }}
          ListEmptyComponent={keyword
            ? <ScreenState empty emptyIcon={SearchX} emptyText={`Không có khuyến mãi cho "${keyword}".`} />
            : <ScreenState empty emptyIcon={Tags} emptyText="Hiện chưa có khuyến mãi." />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, local.card, { maxWidth: grid.cellWidth }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${discountLabel(item.discountInfo) ?? ""}. Hết hạn ${formatDay(item.endsAt)}`}
              accessibilityHint="Xem chi tiết khuyến mãi"
              onPress={() => setSelected(item)}
            >
              <View style={[styles.row, local.cardHead]}>
                <RemoteImage uri={item.imageUrl} size={64} />
                <View style={local.flex}>
                  <Text style={styles.title}>{item.title}</Text>
                  {discountLabel(item.discountInfo) ? (
                    <View style={styles.row}>
                      <AppIcon icon={Tag} size="sm" color={colors.success} />
                      <Text style={local.discount}>{discountLabel(item.discountInfo)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
              <View style={[styles.row, local.footer]}>
                <AppIcon icon={Calendar} size="sm" color={colors.muted} />
                <Text style={styles.caption}>
                  {new Date(item.startsAt).toLocaleDateString("vi-VN")} – {new Date(item.endsAt).toLocaleDateString("vi-VN")}
                </Text>
              </View>
              {item.productKeywords.length ? <Text style={styles.caption}>{item.productKeywords.join(" · ")}</Text> : null}
            </Pressable>
          )}
        />
      )}
      <PromotionDetail promotion={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

type PromotionDetailProps = { promotion: Promotion | null; onClose: () => void };

/**
 * Promotion detail. "Mua" does what the app already does for buying: it adds the product to the family's
 * shopping list (POST /api/shopping-list/items, 1 PIECE; the quantity can be changed in "Đi chợ").
 */
function PromotionDetail({ promotion, onClose }: PromotionDetailProps): React.JSX.Element {
  const { accessToken, family } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => { setMessage(null); setBusy(false); }, [promotion?.id]);

  const buy = async () => {
    if (!promotion) return;
    if (!accessToken || !family) {
      setMessage({ text: "Bạn cần tham gia một gia đình để thêm vào danh sách đi chợ.", tone: "error" });
      return;
    }
    const name = itemName(promotion.title);
    setBusy(true); setMessage(null);
    try {
      await shoppingApi.addItem(accessToken, { familyId: family.id, name, quantity: 1, unit: "PIECE" });
      setMessage({ text: `Đã thêm "${name}" vào danh sách đi chợ.`, tone: "success" });
    } catch (caught) {
      setMessage({ text: caught instanceof Error ? caught.message : "Không thêm được vào danh sách đi chợ.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const discount = promotion ? discountLabel(promotion.discountInfo) : null;
  return (
    <Modal visible={promotion !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, local.detail]}>
          <View style={styles.spaceBetween}>
            <AppText variant="subheading" accessibilityRole="header" style={local.flex}>Chi tiết khuyến mãi</AppText>
            <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
          </View>
          {promotion ? (
            <ScrollView contentContainerStyle={local.detailBody}>
              <View style={local.detailImage}><RemoteImage uri={promotion.imageUrl} size={160} accessibilityLabel={promotion.title} /></View>
              <AppText variant="heading">{promotion.title}</AppText>
              {discount ? (
                <View style={styles.row}>
                  <AppIcon icon={Tag} size="sm" color={colors.success} />
                  <AppText variant="label" color={colors.success}>{discount}</AppText>
                </View>
              ) : null}
              <View style={styles.row}>
                <AppIcon icon={Calendar} size="sm" color={colors.muted} />
                <AppText variant="caption">Đến hết ngày {formatDay(promotion.endsAt)}</AppText>
              </View>
              {promotion.description ? <AppText variant="body">{promotion.description}</AppText> : null}
              <Button label="Mua" icon={ShoppingCart} onPress={() => void buy()} busy={busy} accessibilityLabel={`Mua: thêm ${itemName(promotion.title)} vào danh sách đi chợ`} />
              {message ? (
                <View style={[styles.row, local.message]} accessibilityLiveRegion="polite">
                  <AppIcon icon={message.tone === "success" ? CircleCheck : CircleExclamationPoint} size="sm" color={message.tone === "success" ? colors.success : colors.danger} />
                  <AppText variant="bodySmall" color={message.tone === "success" ? colors.success : colors.danger} style={local.flex}>{message.text}</AppText>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  listContent: { gap: 12, paddingBottom: 24 },
  card: { flex: 1, gap: 6 },
  discount: { color: colors.success, flexShrink: 1, fontWeight: "600" },
  footer: { marginTop: 2 },
  cardHead: { alignItems: "flex-start" },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  detail: { maxWidth: 440 },
  detailBody: { gap: 10, paddingBottom: 4 },
  detailImage: { alignItems: "center" },
  message: { alignItems: "flex-start" },
});
