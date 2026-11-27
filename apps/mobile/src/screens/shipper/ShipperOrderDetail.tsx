import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banknote, MapPin, Maximize2, Phone, StickyNote, User, X } from "lucide-react-native";
import MapFrame from "../../components/MapFrame";
import ShipperRouteMap from "./ShipperRouteMap";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatVnd } from "../../services/format";
import { discountText } from "../shopping-cart/checkoutSummary";
import {
  deliverConfirmTitle, directionsUrls, distanceText, FAIL_REASONS, failReasonText, itemCountText, lineQuantity, mapViewHtml, placedText, telUrl,
  type FailReason, type ShipperOrder, type ShipperScope,
} from "./shipper";
import { shipperApi, shipperErrorText } from "./shipperApi";

type Props = {
  orderId: string | null;
  origin: { latitude: number; longitude: number } | null;
  accessToken: string | null;
  onClose: () => void;
  /** After an action: the tab the order moved to (undefined: just refresh). */
  onChanged: (movedTo?: ShipperScope) => void;
};

/**
 * One order for the shipper: map pin, address with "Chỉ đường" (device map app), receiver with "Gọi", note, a receipt
 * (quantity, unit price after discount with the original struck through, line total) and "Tổng tiền cần thu" = COD.
 * Actions: "Nhận đơn" (waiting), "Đã giao" with a confirm, "Không giao được" with a reason (mine, being delivered).
 */
export default function ShipperOrderDetail({ orderId, origin, accessToken, onClose, onChanged }: Props): React.JSX.Element {
  const api = useMemo(() => shipperApi(accessToken), [accessToken]);
  const [order, setOrder] = useState<ShipperOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState<FailReason | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [routeOpen, setRouteOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (id: string) => {
    setError(null);
    try {
      setOrder(await api.detail(id, origin));
    } catch (caught) {
      setError(shipperErrorText(caught, "load"));
    }
  }, [api, origin]);
  useEffect(() => {
    setOrder(null); setFailOpen(false); setReason(null); setOtherReason("");
    if (orderId) void load(orderId);
  }, [orderId, load]);

  const run = async (action: () => Promise<ShipperOrder>, kind: "accept" | "deliver" | "fail", movedTo: ShipperScope) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setOrder((current) => (current ? { ...current, ...next } : next));
      onChanged(movedTo);
      if (kind !== "accept") onClose();
    } catch (caught) {
      const message = shipperErrorText(caught, kind);
      onChanged();
      // Someone else took it: keep "Đơn đã có người nhận" (a reload would only answer 404) and drop the action.
      if (kind === "accept") setOrder((current) => (current ? { ...current, status: "CANCELLED" } : current));
      else if (orderId) await load(orderId);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const deliver = async () => {
    if (!order) return;
    const ok = await confirm({ title: deliverConfirmTitle(order.codAmount), confirmLabel: "Đã giao", cancelLabel: "Chưa" });
    if (ok) await run(() => api.deliver(order.id), "deliver", "history");
  };
  const fail = async () => {
    const text = failReasonText(reason, otherReason);
    if (!order || !text) return;
    setFailOpen(false);
    await run(() => api.fail(order.id, text), "fail", "history");
  };
  const directions = async () => {
    if (!order) return;
    for (const url of directionsUrls(order, Platform.OS)) {
      try { await Linking.openURL(url); return; } catch { /* next */ }
    }
    setError("Không mở được ứng dụng bản đồ.");
  };

  const hasPoint = order?.latitude !== null && order?.latitude !== undefined && order?.longitude !== null && order?.longitude !== undefined;
  const distance = distanceText(order?.distanceKm ?? null);

  return (
    <Modal animationType="slide" visible={orderId !== null} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng đơn hàng" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Chi tiết đơn</Text>
          <View style={local.spacer} />
        </View>
        {!order ? (
          <View style={local.center}>
            {error ? <><Text style={local.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => orderId && void load(orderId)} style={local.secondary}><Text style={local.secondaryText}>Thử lại</Text></Pressable></> : <ActivityIndicator color={colors.primary} />}
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={local.content} showsVerticalScrollIndicator={false}>
              {hasPoint ? (
                // Tap: full-screen map with the shipper's position and the route (web: iframe, phones: WebView).
                <Pressable accessibilityRole="button" accessibilityLabel="Mở bản đồ đường đi" onPress={() => setRouteOpen(true)} style={local.mapWrap}>
                  <MapFrame html={mapViewHtml(order.latitude as number, order.longitude as number)} interactive={false} style={local.map} accessibilityLabel="Vị trí giao hàng" />
                  <View style={local.mapHint} pointerEvents="none">
                    <AppIcon icon={Maximize2} size="sm" color={colors.primary} />
                    <Text style={local.mapHintText}>Xem đường đi</Text>
                  </View>
                </Pressable>
              ) : null}
              <View style={local.card}>
                <View style={local.row}>
                  <AppIcon icon={MapPin} size="sm" color={colors.primary} />
                  <Text style={local.address}>{order.deliveryAddress ?? "Chưa có địa chỉ"}</Text>
                </View>
                <Text style={local.meta}>{distance ? `Cách ${distance} · ` : ""}{itemCountText(order.itemCount)} · đặt {placedText(order.orderedAt)}</Text>
              </View>

              <View style={local.card}>
                <View style={local.row}>
                  <AppIcon icon={User} size="sm" color={colors.primary} />
                  <View style={local.flex}>
                    <Text style={local.label}>{order.receiverName ?? "Người nhận"}</Text>
                    {order.receiverPhone ? <Text style={local.meta}>{order.receiverPhone}</Text> : null}
                  </View>
                  {order.receiverPhone ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Gọi ${order.receiverName ?? "người nhận"}`} onPress={() => void Linking.openURL(telUrl(order.receiverPhone as string))} style={local.call}>
                      <AppIcon icon={Phone} size="sm" color={colors.primaryText} />
                      <Text style={local.callText}>Gọi</Text>
                    </Pressable>
                  ) : null}
                </View>
                {order.note ? (
                  <View style={[local.row, local.noteRow]}>
                    <AppIcon icon={StickyNote} size="sm" color={colors.warning} />
                    <Text style={local.note}>{order.note}</Text>
                  </View>
                ) : null}
              </View>

              <View style={local.card}>
                <Text style={local.sectionTitle}>Hóa đơn</Text>
                {order.items.map((line, index) => (
                  <View key={`${line.name}-${index}`} style={[local.line, index > 0 && local.lineDivider]} accessible
                    accessibilityLabel={`${line.name}, ${lineQuantity(line)}${line.lineTotal !== null ? `, ${formatVnd(line.lineTotal).replace("đ", " đồng")}` : ", chưa có giá"}`}>
                    <View style={local.flex}>
                      <Text style={local.lineName}>{line.name}</Text>
                      <Text style={local.lineMeta}>
                        {lineQuantity(line)}{line.unitPrice !== null ? ` × ${formatVnd(line.unitPrice)}` : ""}
                        {line.originalUnitPrice !== null ? <Text style={local.struck}>{`  ${formatVnd(line.originalUnitPrice)}`}</Text> : null}
                      </Text>
                    </View>
                    <Text style={line.lineTotal !== null ? local.lineTotal : local.lineMeta}>{line.lineTotal !== null ? formatVnd(line.lineTotal) : "Chưa có giá"}</Text>
                  </View>
                ))}
                {order.discountAmount && order.promotionName ? (
                  <>
                    <View style={[local.line, local.lineDivider]} accessible accessibilityLabel={`Tạm tính ${formatVnd(order.subtotal ?? order.codAmount).replace("đ", " đồng")}`}>
                      <Text style={[local.lineMeta, local.flex]}>Tạm tính</Text>
                      <Text style={local.lineTotal}>{formatVnd(order.subtotal ?? order.codAmount)}</Text>
                    </View>
                    <View style={local.line} accessible accessibilityLabel={`Khuyến mãi ${order.promotionName}, trừ ${formatVnd(order.discountAmount).replace("đ", " đồng")}`}>
                      <Text style={[local.lineMeta, local.flex]} numberOfLines={2}>Khuyến mãi: {order.promotionName}</Text>
                      <Text style={[local.lineTotal, local.discount]}>{discountText(order.discountAmount)}</Text>
                    </View>
                  </>
                ) : null}
                <View style={local.totalRow} accessible accessibilityLabel={`Tổng tiền cần thu ${formatVnd(order.codAmount).replace("đ", " đồng")}`}>
                  <View style={local.row}><AppIcon icon={Banknote} size="sm" color={colors.text} /><Text style={local.totalLabel}>Tổng tiền cần thu</Text></View>
                  <Text style={local.totalValue}>{formatVnd(order.codAmount)}</Text>
                </View>
              </View>
              {order.status === "FAILED" && order.failReason ? <Text style={local.errorText}>Không giao được: {order.failReason}</Text> : null}
              {error ? <Text style={local.errorBox} accessibilityRole="alert">{error}</Text> : null}
            </ScrollView>

            {order.status === "PENDING" || order.status === "SHIPPING" ? (
              <View style={local.footer}>
                {order.status === "PENDING" ? (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => api.accept(order.id), "accept", "mine")} style={[local.primary, busy && local.disabled]}>
                    {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={local.primaryText}>Nhận đơn</Text>}
                  </Pressable>
                ) : (
                  <View style={local.actions}>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setFailOpen(true)} style={[local.danger, busy && local.disabled]}>
                      <Text style={local.dangerText}>Không giao được</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void deliver()} style={[local.primary, local.flex, busy && local.disabled]}>
                      {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={local.primaryText}>Đã giao</Text>}
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}
          </>
        )}

        {failOpen ? (
          <View style={local.sheetBackdrop}>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setFailOpen(false)} style={StyleSheet.absoluteFill} />
            <View style={local.sheet}>
              <Text style={local.sectionTitle} accessibilityRole="header">Lý do không giao được</Text>
              {FAIL_REASONS.map((option) => (
                <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: reason === option }} onPress={() => setReason(option)} style={local.reason}>
                  <View style={[local.radio, reason === option && local.radioOn]}>{reason === option ? <View style={local.radioDot} /> : null}</View>
                  <Text style={local.reasonText}>{option}</Text>
                </Pressable>
              ))}
              {reason === "Khác" ? (
                <TextInput accessibilityLabel="Lý do khác" value={otherReason} onChangeText={setOtherReason} placeholder="Nhập lý do" placeholderTextColor={colors.muted} style={local.input} maxLength={300} autoFocus />
              ) : null}
              <View style={local.actions}>
                <Pressable accessibilityRole="button" onPress={() => setFailOpen(false)} style={local.secondaryWide}><Text style={local.secondaryText}>Hủy</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={!failReasonText(reason, otherReason)} onPress={() => void fail()} style={[local.dangerFill, !failReasonText(reason, otherReason) && local.disabled]}>
                  <Text style={local.primaryText}>Xác nhận</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        <ShipperRouteMap
          customer={routeOpen && order && hasPoint ? { latitude: order.latitude as number, longitude: order.longitude as number } : null}
          address={order?.deliveryAddress ?? null}
          onClose={() => setRouteOpen(false)}
          onOpenExternal={() => void directions()}
        />
        {dialog}
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  title: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  center: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  content: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  flex: { flex: 1, minWidth: 0 },
  mapWrap: { borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 180, overflow: "hidden" },
  map: { flex: 1 },
  mapHint: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, bottom: spacing.sm, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, position: "absolute", right: spacing.sm },
  mapHintText: { ...textStyles.caption, color: colors.primary, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  address: { ...textStyles.label, flex: 1 },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  label: { ...textStyles.label },
  sectionTitle: { ...textStyles.subheading },
  secondary: { alignItems: "center", alignSelf: "flex-start", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  secondaryWide: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: touchTarget },
  secondaryText: { ...textStyles.labelSmall, color: colors.primary },
  call: { alignItems: "center", backgroundColor: colors.success, borderRadius: radius.pill, flexDirection: "row", gap: spacing.xs, minHeight: touchTarget, paddingHorizontal: spacing.lg },
  callText: { ...textStyles.labelSmall, color: colors.primaryText },
  noteRow: { alignItems: "flex-start", backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.sm },
  note: { ...textStyles.bodySmall, flex: 1 },
  line: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  lineDivider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  lineName: { ...textStyles.bodySmall, fontWeight: "600" },
  lineMeta: { ...textStyles.caption, marginTop: 2 },
  struck: { ...textStyles.caption, textDecorationLine: "line-through" },
  lineTotal: { ...textStyles.labelSmall, textAlign: "right" },
  discount: { color: colors.success },
  totalRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.md },
  totalLabel: { ...textStyles.label },
  totalValue: { ...textStyles.heading, color: colors.primary },
  errorText: { ...textStyles.bodySmall, color: colors.danger, textAlign: "center" },
  errorBox: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, padding: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm },
  primary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.lg },
  primaryText: { ...textStyles.label, color: colors.primaryText },
  danger: { alignItems: "center", borderColor: colors.danger, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: spacing.lg },
  dangerText: { ...textStyles.label, color: colors.danger },
  dangerFill: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: touchTarget },
  disabled: { opacity: 0.5 },
  sheetBackdrop: { backgroundColor: colors.overlay, bottom: 0, justifyContent: "flex-end", left: 0, position: "absolute", right: 0, top: 0 },
  sheet: { alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm, maxWidth: 720, padding: spacing.lg, width: "100%" },
  reason: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: touchTarget },
  radio: { alignItems: "center", borderColor: colors.muted, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: "center", width: 20 },
  radioOn: { borderColor: colors.danger },
  radioDot: { backgroundColor: colors.danger, borderRadius: 5, height: 10, width: 10 },
  reasonText: { ...textStyles.body },
  input: { ...textStyles.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: spacing.md },
});
