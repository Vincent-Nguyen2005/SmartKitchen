import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Package, Phone, RefreshCw, Truck, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatVnd } from "../../services/format";
import { amountText } from "./unitDisplay";
import { canCancel, ORDER_STATUS, orderTime, type StatusTone } from "./orders";
import { shoppingApi, type Order } from "./shoppingApi";

type Props = { visible: boolean; familyId: string; accessToken: string; onClose: () => void; onChanged?: () => void };

const TONES: Record<StatusTone, { background: string; text: string }> = {
  warning: { background: colors.warningSoft, text: colors.warning },
  primary: { background: colors.primarySoft, text: colors.primary },
  success: { background: colors.successSoft, text: colors.success },
  muted: { background: colors.background, text: colors.muted },
  danger: { background: colors.dangerSoft, text: colors.danger },
};

/**
 * "Đơn hàng" (Giỏ hàng header): the family's delivery orders, newest first, with status, address, items and total
 * (cash on delivery). "Hủy đơn" while the order still waits for a shipper (in-app confirm).
 */
export default function OrdersScreen({ visible, familyId, accessToken, onClose, onChanged }: Props): React.JSX.Element {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      setOrders((await shoppingApi.orders(accessToken, familyId)).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được đơn hàng.");
    } finally {
      setRefreshing(false);
    }
  }, [accessToken, familyId]);
  useEffect(() => { if (visible) { setOrders(null); void load(); } }, [visible, load]);

  const cancel = useCallback(async (order: Order) => {
    const ok = await confirm({ title: "Hủy đơn hàng?", message: `Đơn ${orderTime(order.purchasedAt)} (${formatVnd(order.total)}) sẽ bị hủy và các món "Đang giao" được bỏ khỏi Kho.`, cancelLabel: "Giữ đơn", confirmLabel: "Hủy đơn", destructive: true });
    if (!ok) return;
    setBusyId(order.id);
    try {
      const { order: updated } = await shoppingApi.cancelOrder(accessToken, familyId, order.id);
      setOrders((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? current);
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa hủy được đơn.");
      void load();
    } finally {
      setBusyId(null);
    }
  }, [accessToken, confirm, familyId, load, onChanged]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng Đơn hàng" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Đơn hàng</Text>
          <View style={local.spacer} />
        </View>
        {orders === null && !error ? (
          <View style={local.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <FlatList
            data={orders ?? []}
            keyExtractor={(order) => order.id}
            renderItem={({ item }) => <OrderCard order={item} busy={busyId === item.id} onCancel={cancel} />}
            contentContainerStyle={local.content}
            ListHeaderComponent={error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : undefined}
            ListEmptyComponent={error ? <StateView icon={RefreshCw} text="Không tải được đơn hàng" action="Thử lại" onAction={() => void load()} /> : <StateView icon={Package} text="Chưa có đơn hàng" />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
            showsVerticalScrollIndicator={false}
          />
        )}
        {dialog}
      </SafeAreaView>
    </Modal>
  );
}

const OrderCard = memo(function OrderCard({ order, busy, onCancel }: { order: Order; busy: boolean; onCancel: (order: Order) => void }): React.JSX.Element {
  const status = ORDER_STATUS[order.status];
  const tone = TONES[status.tone];
  return (
    <View style={local.card} accessible={false}>
      <View style={local.cardHeader}>
        <Text style={local.cardTime}>{orderTime(order.purchasedAt)}</Text>
        <View style={[local.chip, { backgroundColor: tone.background }]}><Text style={[local.chipText, { color: tone.text }]}>{status.label}</Text></View>
      </View>
      {order.deliveryAddress ? (
        <View style={local.addressRow}>
          <AppIcon icon={MapPin} size="sm" color={colors.muted} />
          <Text style={local.address} numberOfLines={2}>{order.deliveryAddress}</Text>
        </View>
      ) : null}
      <Text style={local.items} numberOfLines={2}>
        {order.items.map((line) => `${line.name} ${amountText(line.quantity, line.unit, line.unitLabel)}`).join(" · ")}
      </Text>
      {order.shipper?.name || order.shipper?.phone ? (
        <View style={local.shipperRow}>
          <AppIcon icon={Truck} size="sm" color={colors.primary} />
          <Text style={local.shipperText} numberOfLines={1}>Người giao: {order.shipper.name ?? "—"}{order.shipper.phone ? ` · ${order.shipper.phone}` : ""}</Text>
          {order.shipper.phone && order.status === "SHIPPING" ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Gọi người giao hàng ${order.shipper.name ?? ""}`} onPress={() => void Linking.openURL(`tel:${(order.shipper?.phone ?? "").replace(/[^\d+]/g, "")}`)} style={local.callButton}>
              <AppIcon icon={Phone} size="sm" color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {order.status === "FAILED" && order.failReason ? <Text style={local.failReason}>Lý do: {order.failReason}</Text> : null}
      <View style={local.cardFooter}>
        <View>
          <Text style={local.total}>{formatVnd(order.total)}</Text>
          <Text style={local.cod}>Thanh toán khi nhận hàng</Text>
        </View>
        {canCancel(order.status) ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Hủy đơn ${orderTime(order.purchasedAt)}`} disabled={busy} onPress={() => onCancel(order)} style={[local.cancel, busy && local.disabled]}>
            {busy ? <ActivityIndicator color={colors.danger} /> : <Text style={local.cancelText}>Hủy đơn</Text>}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

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
  title: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardTime: { ...textStyles.label },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chipText: { ...textStyles.caption, fontWeight: "700" },
  addressRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.xs },
  address: { ...textStyles.bodySmall, color: colors.muted, flex: 1 },
  items: { ...textStyles.bodySmall },
  failReason: { ...textStyles.bodySmall, color: colors.danger },
  shipperRow: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.sm },
  shipperText: { ...textStyles.bodySmall, flex: 1 },
  callButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  cardFooter: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.sm },
  total: { ...textStyles.subheading },
  cod: { ...textStyles.caption },
  cancel: { alignItems: "center", borderColor: colors.danger, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  cancelText: { ...textStyles.labelSmall, color: colors.danger },
  disabled: { opacity: 0.6 },
  error: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl * 2 },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 56, justifyContent: "center", width: 56 },
  stateText: { ...textStyles.body, color: colors.muted },
  stateButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
  stateButtonText: { ...textStyles.label, color: colors.primaryText },
});
