import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, RefreshCw, ShoppingBag, Truck, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { SegmentTabs } from "../../components/SegmentTabs";
import UserAvatar from "../../components/UserAvatar";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage, query } from "../notifications/gatewayApi";
import { colors } from "../notifications/ui";
import { vnd, vndSpoken } from "../spending/spending";
import { orderTime } from "../shopping-cart/orders";
import { canGoForward, deliveredText, ordersText, PERIOD_OPTIONS, periodTitle, shipperTitle, type RevenuePeriod, type RevenueReport, type ShipperCash } from "./revenue";

type Props = { visible: boolean; onClose: () => void };

/**
 * Quản trị › "Doanh thu" (full-screen page from the bottom bar): shipper cash reconciliation for today / 7 ngày /
 * tháng này with ‹ › to earlier periods (Vietnam days, delivered orders only). One summary card (Tổng tiền đã thu,
 * <N> đơn đã giao), then "Theo nhân viên giao hàng" sorted by amount; a row opens that shipper's delivered orders.
 */
export default function AdminRevenueScreen({ visible, onClose }: Props): React.JSX.Element {
  const { api } = useGatewayApi();
  const [period, setPeriod] = useState<RevenuePeriod>("today");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opened, setOpened] = useState<ShipperCash | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      const result = (await api.get<{ data: RevenueReport }>(`/api/shopping-list/admin/revenue${query({ period, offset })}`)).data;
      if (id === requestId.current) setReport(result);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [api, period, offset]);

  useEffect(() => { if (visible) { setReport(null); void load(); } }, [visible, load]);
  useEffect(() => { if (!visible) { setPeriod("today"); setOffset(0); setOpened(null); } }, [visible]);

  const shown = report && report.period.kind === period && report.period.offset === offset ? report : null;
  const openShipper = useCallback((shipper: ShipperCash) => setOpened(shipper), []);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng Doanh thu" onPress={onClose} />
          <Text style={local.topTitle} accessibilityRole="header">Doanh thu</Text>
          <View style={local.spacer} />
        </View>
        <ScrollView contentContainerStyle={local.content} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />}>
          <SegmentTabs options={PERIOD_OPTIONS} value={period} onChange={(value) => { setPeriod(value); setOffset(0); }} />
          <View style={local.switcher}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Kỳ trước" color={colors.primary} onPress={() => setOffset((value) => value - 1)} />
            <Text style={local.switcherTitle} accessibilityRole="header">{shown ? periodTitle(shown.period) : " "}</Text>
            <IconButton icon={ChevronRight} accessibilityLabel={canGoForward(offset) ? "Kỳ sau" : "Không có kỳ sau"} color={colors.primary} disabled={!canGoForward(offset)} onPress={() => setOffset((value) => Math.min(0, value + 1))} />
          </View>

          {error && !shown ? (
            <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load()} />
          ) : !shown ? (
            <View style={{ gap: spacing.md }}>{[104, 64, 64].map((height, index) => <View key={index} style={[local.card, local.skeleton, { height }]} />)}</View>
          ) : (
            <>
              <View style={local.card} accessible accessibilityLabel={`Tổng tiền đã thu ${vndSpoken(shown.total)}, ${deliveredText(shown.orders)}`}>
                <Text style={local.caption}>Tổng tiền đã thu</Text>
                <Text style={local.big}>{vnd(shown.total)}</Text>
                <Text style={local.meta}>{deliveredText(shown.orders)}</Text>
              </View>
              <Text style={local.sectionTitle} accessibilityRole="header">Theo nhân viên giao hàng</Text>
              {shown.shippers.length === 0 ? (
                <StateView icon={Truck} text="Chưa có đơn nào được giao trong kỳ này." />
              ) : (
                <View style={local.listCard}>
                  {shown.shippers.map((shipper, index) => <ShipperRow key={`${shipper.name ?? "direct"}-${index}`} shipper={shipper} first={index === 0} onOpen={openShipper} />)}
                </View>
              )}
            </>
          )}
        </ScrollView>
        <ShipperSheet shipper={opened} onClose={() => setOpened(null)} />
      </SafeAreaView>
    </Modal>
  );
}

const ShipperRow = memo(function ShipperRow({ shipper, first, onOpen }: { shipper: ShipperCash; first: boolean; onOpen: (shipper: ShipperCash) => void }): React.JSX.Element {
  const title = shipperTitle(shipper);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${ordersText(shipper.orders)}, ${vndSpoken(shipper.amount)}. Xem các đơn`} onPress={() => onOpen(shipper)}
      style={({ pressed }) => [local.row, !first && local.divider, pressed && local.pressed]}>
      {shipper.direct ? (
        <View style={local.directIcon}><AppIcon icon={ShoppingBag} size="sm" color={colors.primary} /></View>
      ) : <UserAvatar name={shipper.name} avatarUrl={shipper.avatarUrl} size={40} />}
      <View style={local.flex}>
        <Text style={local.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={local.meta}>{ordersText(shipper.orders)}</Text>
      </View>
      <Text style={local.amount}>{vnd(shipper.amount)}</Text>
      <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
    </Pressable>
  );
});

function ShipperSheet({ shipper, onClose }: { shipper: ShipperCash | null; onClose: () => void }): React.JSX.Element {
  return (
    <Modal animationType="slide" transparent visible={shipper !== null} onRequestClose={onClose}>
      <View style={local.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={local.sheet} edges={["bottom"]}>
          {shipper ? (
            <>
              <View style={local.sheetHeader}>
                <View style={local.flex}>
                  <Text style={local.sheetTitle} accessibilityRole="header" numberOfLines={1}>{shipperTitle(shipper)}</Text>
                  <Text style={local.meta}>{ordersText(shipper.orders)} · {vnd(shipper.amount)}</Text>
                </View>
                <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
              </View>
              <ScrollView contentContainerStyle={local.sheetBody} showsVerticalScrollIndicator={false}>
                {shipper.deliveries.map((delivery, index) => (
                  <View key={delivery.id} style={[local.row, index > 0 && local.divider]} accessible accessibilityLabel={`${orderTime(delivery.deliveredAt)}, ${delivery.receiverName ?? "không rõ người nhận"}, ${vndSpoken(delivery.total)}`}>
                    <View style={local.flex}>
                      <Text style={local.rowTitle} numberOfLines={1}>{delivery.receiverName ?? "Không rõ người nhận"}</Text>
                      <Text style={local.meta}>{orderTime(delivery.deliveredAt)}</Text>
                    </View>
                    <Text style={local.amount}>{vnd(delivery.total)}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
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

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  content: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  switcher: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: -spacing.sm },
  switcherTitle: { ...textStyles.label, flex: 1, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  skeleton: { backgroundColor: colors.border, opacity: 0.5 },
  caption: { ...textStyles.caption, color: colors.muted },
  big: { ...textStyles.pageTitle },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  sectionTitle: { ...textStyles.label, marginTop: spacing.xs },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.7 },
  directIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  flex: { flex: 1, minWidth: 0 },
  rowTitle: { ...textStyles.label },
  amount: { ...textStyles.label, textAlign: "right" },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "80%", maxWidth: 720, width: "100%" },
  sheetHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.sm },
  sheetTitle: { ...textStyles.subheading },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 32, height: 64, justifyContent: "center", width: 64 },
  stateText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  stateButton: { borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  stateButtonText: { ...textStyles.label, color: colors.primary },
});
