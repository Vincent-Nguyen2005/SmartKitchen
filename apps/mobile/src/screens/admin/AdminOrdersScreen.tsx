import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ban, MapPin, Package, Phone, RefreshCw, Search, Truck, UserMinus, UserRound, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatVnd } from "../../services/format";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage, query } from "../notifications/gatewayApi";
import { colors } from "../notifications/ui";
import { ORDER_STATUS, orderTime, type StatusTone } from "../shopping-cart/orders";
import { amountText } from "../shopping-cart/unitDisplay";
import { discountText } from "../shopping-cart/checkoutSummary";
import {
  ADMIN_STATUS_TABS, canCancel, canUnassign, cancelConfirm, orderCardLabel, shortAddress, statusLabel, tabLabel, unassignConfirm,
  type AdminOrderDetail, type AdminOrderList, type AdminOrderStatus, type AdminOrderSummary,
} from "./adminOrders";

const BASE = "/api/shopping-list/admin/orders";
const PAGE = 20;
const TONES: Record<StatusTone, { background: string; text: string }> = {
  warning: { background: colors.warningSoft, text: colors.warning },
  primary: { background: colors.primarySoft, text: colors.primary },
  success: { background: colors.successSoft, text: colors.success },
  muted: { background: colors.background, text: colors.muted },
  danger: { background: colors.dangerSoft, text: colors.danger },
};
const toneOf = (status: AdminOrderStatus) => TONES[ORDER_STATUS[status].tone];

type Props = { visible: boolean; onClose: () => void };

/**
 * Quản trị › "Đơn hàng" (full-screen page from the bottom bar): every delivery order, by status (tabs with counts),
 * searchable by receiver name / phone / address, newest first, more pages while scrolling. A card opens the detail
 * with "Hủy đơn" (waiting orders) or "Gỡ người giao" (orders being delivered), both confirmed and audit-logged.
 */
export default function AdminOrdersScreen({ visible, onClose }: Props): React.JSX.Element {
  const { api } = useGatewayApi();
  const [status, setStatus] = useState<AdminOrderStatus>("PENDING");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [list, setList] = useState<AdminOrderList | null>(null);
  const [items, setItems] = useState<AdminOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const requestId = useRef(0);

  // The search is sent 400 ms after typing stops.
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 400); return () => clearTimeout(timer); }, [search]);

  const load = useCallback(async (mode: "load" | "refresh" | "more", page = 1) => {
    const id = ++requestId.current;
    if (mode === "load") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    if (mode === "more") setLoadingMore(true);
    try {
      const result = (await api.get<{ data: AdminOrderList }>(`${BASE}${query({ status, q: term || undefined, page, limit: PAGE })}`)).data;
      if (id !== requestId.current) return;
      setList(result);
      setItems((current) => (mode === "more" ? [...current, ...result.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.items));
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [api, status, term]);

  useEffect(() => { if (visible) void load("load"); }, [visible, load]);
  useEffect(() => { if (!visible) { setOpenedId(null); setSearch(""); setTerm(""); setStatus("PENDING"); } }, [visible]);

  const loadMore = () => {
    if (!list || loading || loadingMore || items.length >= list.total) return;
    void load("more", list.page + 1);
  };
  const open = useCallback((order: AdminOrderSummary) => setOpenedId(order.id), []);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng Đơn hàng" onPress={onClose} />
          <Text style={local.topTitle} accessibilityRole="header">Đơn hàng</Text>
          <View style={local.spacer} />
        </View>
        <View style={local.controls}>
          <View style={local.search}>
            <AppIcon icon={Search} size="sm" color={colors.muted} />
            <TextInput accessibilityLabel="Tìm theo tên, số điện thoại hoặc địa chỉ" value={search} onChangeText={setSearch} placeholder="Tên, số điện thoại, địa chỉ" placeholderTextColor={colors.muted} style={local.searchInput} autoCorrect={false} />
          </View>
          {/* All five chips stay visible: they wrap to a second row on narrow phones (no hidden chip at the edge). */}
          <View style={local.tabs} accessibilityRole="tablist">
            {ADMIN_STATUS_TABS.map((tab) => {
              const selected = tab.key === status;
              return (
                <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setStatus(tab.key)} style={[local.tab, selected && local.tabSelected]}>
                  <Text style={[local.tabText, selected && local.tabTextSelected]} numberOfLines={1}>{tabLabel(tab, list?.counts ?? null)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} onOpen={open} />}
          contentContainerStyle={local.listContent}
          ItemSeparatorComponent={Gap}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          initialNumToRender={10}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={loading || (!list && !error) ? <Skeleton /> : error ? (
            <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load("load")} />
          ) : <StateView icon={Package} text={term ? "Không tìm thấy đơn hàng phù hợp." : `Không có đơn "${statusLabel(status)}".`} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={local.more} /> : undefined}
          showsVerticalScrollIndicator={false}
        />
        <OrderSheet orderId={openedId} onClose={() => setOpenedId(null)} onChanged={() => void load("refresh")} />
      </SafeAreaView>
    </Modal>
  );
}

function Gap(): React.JSX.Element { return <View style={{ height: spacing.sm }} />; }

const OrderCard = memo(function OrderCard({ order, onOpen }: { order: AdminOrderSummary; onOpen: (order: AdminOrderSummary) => void }): React.JSX.Element {
  const tone = toneOf(order.status);
  const time = orderTime(order.purchasedAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${orderCardLabel(order, time)}. Xem chi tiết`} onPress={() => onOpen(order)} style={({ pressed }) => [local.card, pressed && local.pressed]}>
      <View style={local.cardTop}>
        <Text style={local.cardTime}>{time}</Text>
        <View style={[local.chip, { backgroundColor: tone.background }]}><Text style={[local.chipText, { color: tone.text }]}>{statusLabel(order.status)}</Text></View>
      </View>
      <Text style={local.cardName} numberOfLines={1}>{order.receiverName ?? "Không rõ người nhận"}</Text>
      <View style={local.row}>
        <AppIcon icon={MapPin} size="sm" color={colors.muted} />
        <Text style={local.meta} numberOfLines={1}>{shortAddress(order.deliveryAddress)}</Text>
      </View>
      <View style={local.cardBottom}>
        <Text style={local.meta}>{order.itemCount} món</Text>
        <Text style={local.total}>{formatVnd(order.total)}</Text>
      </View>
    </Pressable>
  );
});

function OrderSheet({ orderId, onClose, onChanged }: { orderId: string | null; onClose: () => void; onChanged: () => void }): React.JSX.Element {
  const { api } = useGatewayApi();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "unassign" | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    if (!orderId) return;
    setError(null);
    try {
      setOrder((await api.get<{ data: { order: AdminOrderDetail } }>(`${BASE}/${encodeURIComponent(orderId)}`)).data.order);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [api, orderId]);
  useEffect(() => { setOrder(null); void load(); }, [load]);

  const act = async (action: "cancel" | "unassign") => {
    if (!order) return;
    const ok = await confirm(action === "cancel" ? cancelConfirm(order.total) : unassignConfirm(order.shipper?.name ?? null));
    if (!ok) return;
    setBusy(action); setError(null);
    try {
      setOrder((await api.post<{ data: { order: AdminOrderDetail } }>(`${BASE}/${encodeURIComponent(order.id)}/${action}`)).data.order);
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={orderId !== null} onRequestClose={onClose}>
      <View style={local.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={local.sheet} edges={["bottom"]}>
          <View style={local.sheetHeader}>
            <Text style={local.sheetTitle} accessibilityRole="header" numberOfLines={1}>{order ? `Đơn ${orderTime(order.purchasedAt)}` : "Chi tiết đơn"}</Text>
            <IconButton icon={X} accessibilityLabel="Đóng chi tiết" onPress={onClose} />
          </View>
          {!order ? (
            error ? <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load()} /> : <ActivityIndicator color={colors.primary} style={local.more} />
          ) : (
            <ScrollView contentContainerStyle={local.sheetBody} showsVerticalScrollIndicator={false}>
              <View style={[local.chip, local.chipLarge, { backgroundColor: toneOf(order.status).background }]}><Text style={[local.chipText, { color: toneOf(order.status).text }]}>{statusLabel(order.status)}</Text></View>
              <Section title="Người nhận">
                <InfoRow icon={UserRound} text={order.receiverName ?? "—"} />
                {order.receiverPhone ? <InfoRow icon={Phone} text={order.receiverPhone} onPress={() => void Linking.openURL(`tel:${order.receiverPhone}`)} label={`Gọi ${order.receiverName ?? "người nhận"}`} /> : null}
                <InfoRow icon={MapPin} text={order.deliveryAddress ?? "—"} />
                {order.note ? <Text style={local.note}>Ghi chú: {order.note}</Text> : null}
              </Section>
              {order.shipper ? (
                <Section title="Người giao">
                  <InfoRow icon={Truck} text={order.shipper.name ?? "Chưa có tên"} />
                  {order.shipper.phone ? <InfoRow icon={Phone} text={order.shipper.phone} onPress={() => void Linking.openURL(`tel:${order.shipper?.phone}`)} label="Gọi người giao" /> : null}
                </Section>
              ) : null}
              <Section title={`Hóa đơn · ${order.itemCount} món`}>
                {order.items.map((line) => (
                  <View key={line.id} style={local.line} accessible accessibilityLabel={`${line.name}, ${amountText(line.quantity, line.unit, line.unitLabel)}${line.lineTotal !== null ? `, ${formatVnd(line.lineTotal).replace("đ", " đồng")}` : ""}`}>
                    <View style={local.flex}>
                      <Text style={local.lineName}>{line.name}</Text>
                      <Text style={local.meta}>
                        {amountText(line.quantity, line.unit, line.unitLabel)}{line.unitPrice !== null ? ` × ${formatVnd(line.unitPrice)}` : ""}
                        {line.originalUnitPrice !== null ? <Text style={local.struck}>{`  ${formatVnd(line.originalUnitPrice)}`}</Text> : null}
                      </Text>
                    </View>
                    <Text style={local.lineTotal}>{line.lineTotal !== null ? formatVnd(line.lineTotal) : "Chưa có giá"}</Text>
                  </View>
                ))}
                {order.discountAmount > 0 && order.promotionName ? (
                  <>
                    <View style={local.sumRow}><Text style={local.meta}>Tạm tính</Text><Text style={local.sumValue}>{formatVnd(order.subtotal)}</Text></View>
                    <View style={local.sumRow}><Text style={[local.meta, local.flex]} numberOfLines={2}>Khuyến mãi: {order.promotionName}</Text><Text style={[local.sumValue, { color: colors.success }]}>{discountText(order.discountAmount)}</Text></View>
                  </>
                ) : null}
                <View style={[local.sumRow, local.totalRow]} accessible accessibilityLabel={`Tổng tiền thu khi giao ${formatVnd(order.codAmount).replace("đ", " đồng")}`}>
                  <Text style={local.totalLabel}>Tổng tiền (COD)</Text>
                  <Text style={local.totalValue}>{formatVnd(order.codAmount)}</Text>
                </View>
              </Section>
              <Section title="Tiến trình">
                {order.timeline.map((step) => (
                  <View key={step.status} style={local.sumRow}><Text style={local.meta}>{statusLabel(step.status)}</Text><Text style={local.sumValue}>{orderTime(step.at)}</Text></View>
                ))}
                {order.failReason ? <Text style={local.failReason}>Lý do: {order.failReason}</Text> : null}
              </Section>
              {error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : null}
              {canCancel(order.status) ? (
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void act("cancel")} style={[local.danger, busy && local.disabled]}>
                  {busy === "cancel" ? <ActivityIndicator color={colors.danger} /> : <AppIcon icon={Ban} size="sm" color={colors.danger} />}
                  <Text style={local.dangerText}>Hủy đơn</Text>
                </Pressable>
              ) : null}
              {canUnassign(order.status) ? (
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void act("unassign")} style={[local.danger, busy && local.disabled]}>
                  {busy === "unassign" ? <ActivityIndicator color={colors.danger} /> : <AppIcon icon={UserMinus} size="sm" color={colors.danger} />}
                  <Text style={local.dangerText}>Gỡ người giao</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
          {dialog}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <View style={local.section}><Text style={local.sectionTitle} accessibilityRole="header">{title}</Text>{children}</View>;
}

function InfoRow({ icon, text, onPress, label }: { icon: LucideIcon; text: string; onPress?: () => void; label?: string }): React.JSX.Element {
  const body = <><AppIcon icon={icon} size="sm" color={onPress ? colors.primary : colors.muted} /><Text style={[local.info, onPress && { color: colors.primary }]}>{text}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.infoRow}>{body}</Pressable> : <View style={local.infoRow}>{body}</View>;
}

function StateView({ icon, text, action, onAction }: { icon: LucideIcon; text: string; action?: string; onAction?: () => void }): React.JSX.Element {
  return (
    <View style={local.state}>
      <View style={local.stateIcon}><AppIcon icon={icon} size="lg" color={colors.primary} /></View>
      <Text style={local.stateText}>{text}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={local.stateButton}><Text style={local.stateButtonText}>{action}</Text></Pressable> : null}
    </View>
  );
}

function Skeleton(): React.JSX.Element {
  return <View accessibilityLabel="Đang tải đơn hàng" style={{ gap: spacing.sm }}>{[0, 1, 2].map((index) => <View key={index} style={[local.card, local.skeleton]} />)}</View>;
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  controls: { alignSelf: "center", gap: spacing.sm, maxWidth: 720, paddingHorizontal: spacing.lg, paddingTop: spacing.md, width: "100%" },
  search: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  searchInput: { ...textStyles.body, flex: 1, minHeight: touchTarget - 2, padding: 0 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingBottom: spacing.xs },
  tab: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: spacing.md },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...textStyles.labelSmall, color: colors.text },
  tabTextSelected: { color: colors.primaryText },
  listContent: { alignSelf: "center", maxWidth: 720, padding: spacing.lg, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  pressed: { opacity: 0.85 },
  cardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardTime: { ...textStyles.labelSmall, color: colors.muted },
  cardName: { ...textStyles.label },
  cardBottom: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  meta: { ...textStyles.bodySmall, color: colors.muted, flexShrink: 1 },
  total: { ...textStyles.label, color: colors.primary },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chipLarge: { alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4 },
  chipText: { ...textStyles.caption, fontWeight: "700" },
  more: { marginVertical: spacing.lg },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%", maxWidth: 720, width: "100%" },
  sheetHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, flexDirection: "row", paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.xs },
  sheetTitle: { ...textStyles.subheading, flex: 1 },
  sheetBody: { gap: spacing.md, padding: spacing.lg },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  sectionTitle: { ...textStyles.label },
  infoRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, minHeight: 28 },
  info: { ...textStyles.body, flex: 1 },
  note: { ...textStyles.bodySmall, color: colors.warning },
  line: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  lineName: { ...textStyles.body },
  struck: { textDecorationLine: "line-through" },
  lineTotal: { ...textStyles.labelSmall, textAlign: "right" },
  sumRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  sumValue: { ...textStyles.bodySmall, textAlign: "right" },
  totalRow: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm },
  totalLabel: { ...textStyles.label },
  totalValue: { ...textStyles.subheading },
  failReason: { ...textStyles.bodySmall, color: colors.danger },
  error: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  danger: { alignItems: "center", borderColor: colors.danger, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: 48 },
  dangerText: { ...textStyles.label, color: colors.danger },
  disabled: { opacity: 0.6 },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl * 2 },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 32, height: 64, justifyContent: "center", width: 64 },
  stateText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  stateButton: { borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg },
  stateButtonText: { ...textStyles.label, color: colors.primary },
  skeleton: { backgroundColor: colors.border, height: 112, opacity: 0.5 },
});
