import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Archive, Banknote, Clock3, LogOut, MapPin, Navigation, PackageCheck, RefreshCw, Truck } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { SegmentTabs } from "../../components/SegmentTabs";
import { useSession } from "../../services/session";
import ShipperOrderDetail from "./ShipperOrderDetail";
import { codText, distanceText, itemCountText, placedText, SHIPPER_TABS, shortAddress, type ShipperOrder, type ShipperScope } from "./shipper";
import { shipperApi, shipperErrorText } from "./shipperApi";

type Props = { onSignOut: () => void };
type Origin = { latitude: number; longitude: number } | null;
const AUTO_REFRESH_MS = 30_000;

/**
 * The shipper shell (role SHIPPER): only orders. "Đơn chờ" (waiting, nearest first when the phone's location is
 * known, else oldest first; refreshed every 30 s while shown), "Đang giao" (mine), "Lịch sử" (mine, delivered or
 * failed, last 30 days). A card opens the order detail with the actions.
 */
export default function ShipperHome({ onSignOut }: Props): React.JSX.Element {
  const { user, accessToken } = useSession();
  const api = useMemo(() => shipperApi(accessToken), [accessToken]);
  const [scope, setScope] = useState<ShipperScope>("available");
  const [lists, setLists] = useState<Partial<Record<ShipperScope, ShipperOrder[]>>>({});
  const [errors, setErrors] = useState<Partial<Record<ShipperScope, string>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [origin, setOrigin] = useState<Origin>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ShipperOrder>>(null);
  const requestId = useRef(0);

  // The phone's position for distances (asked once; without it the list is oldest first).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const Location = await import("expo-location");
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      } catch {
        // No location: oldest first, no distances.
      }
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async (which: ShipperScope, mode: "load" | "refresh" | "silent" = "load") => {
    const id = ++requestId.current;
    if (mode === "refresh") setRefreshing(true);
    try {
      const items = await api.list(which, origin);
      setLists((current) => ({ ...current, [which]: items }));
      setErrors((current) => ({ ...current, [which]: undefined }));
    } catch (error) {
      if (mode !== "silent") setErrors((current) => ({ ...current, [which]: shipperErrorText(error, "load") }));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [api, origin]);

  useEffect(() => { void load(scope); listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [scope, load]);

  // "Đơn chờ": every 30 s while shown and the app is in the foreground.
  useEffect(() => {
    if (scope !== "available" || openedId) return undefined;
    const timer = setInterval(() => { if (AppState.currentState === "active") void load("available", "silent"); }, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load("available", "silent"); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [scope, openedId, load]);

  const orders = lists[scope];
  const error = errors[scope];
  const open = useCallback((order: ShipperOrder) => setOpenedId(order.id), []);
  const empty = SCOPE_EMPTY[scope];

  return (
    <SafeAreaView style={local.screen} edges={["top", "left", "right"]}>
      <View style={local.header}>
        <View style={local.headerIcon}><AppIcon icon={Truck} color={colors.primary} /></View>
        <View style={local.headerText}>
          <Text style={local.headerTitle} numberOfLines={1}>{user?.fullName?.trim() || "Người giao hàng"}</Text>
          <Text style={local.headerSub}>Người giao hàng</Text>
        </View>
        <IconButton icon={LogOut} accessibilityLabel="Đăng xuất" onPress={onSignOut} />
      </View>
      <View style={local.tabs}>
        <SegmentTabs<ShipperScope> options={SHIPPER_TABS} value={scope} onChange={setScope} />
      </View>
      <FlatList
        ref={listRef}
        data={orders ?? []}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderCard order={item} scope={scope} onOpen={open} />}
        contentContainerStyle={local.content}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={error && orders ? <Text style={local.inlineError} accessibilityRole="alert">{error}</Text> : undefined}
        ListEmptyComponent={orders === undefined && !error ? <Skeleton /> : error && !orders
          ? <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load(scope)} />
          : <StateView icon={empty.icon} text={empty.text} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(scope, "refresh")} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
      />
      <ShipperOrderDetail
        orderId={openedId}
        origin={origin}
        accessToken={accessToken}
        onClose={() => setOpenedId(null)}
        onChanged={(next) => {
          // The order moved between tabs: refresh what the shipper sees now and where it went.
          void load(scope, "silent");
          if (next) setScope(next);
        }}
      />
    </SafeAreaView>
  );
}

const SCOPE_EMPTY: Record<ShipperScope, { icon: LucideIcon; text: string }> = {
  available: { icon: Clock3, text: "Chưa có đơn chờ giao" },
  mine: { icon: Truck, text: "Bạn chưa nhận đơn nào" },
  history: { icon: Archive, text: "Chưa có đơn trong 30 ngày qua" },
};

const OrderCard = memo(function OrderCard({ order, scope, onOpen }: { order: ShipperOrder; scope: ShipperScope; onOpen: (order: ShipperOrder) => void }): React.JSX.Element {
  const distance = distanceText(order.distanceKm);
  const finished = order.status === "DELIVERED" || order.status === "FAILED";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shortAddress(order.deliveryAddress)}${distance ? `, cách ${distance}` : ""}, ${itemCountText(order.itemCount)}, ${codText(order.codAmount)}, đặt lúc ${placedText(order.orderedAt)}. Xem chi tiết`}
      onPress={() => onOpen(order)}
      style={({ pressed }) => [local.card, pressed && local.pressed]}
    >
      <View style={local.cardTop}>
        <View style={local.addressRow}>
          <AppIcon icon={MapPin} size="sm" color={colors.primary} />
          <Text style={local.address} numberOfLines={2}>{shortAddress(order.deliveryAddress)}</Text>
        </View>
        {distance ? <View style={local.distance}><AppIcon icon={Navigation} size="sm" color={colors.primary} /><Text style={local.distanceText}>{distance}</Text></View> : null}
      </View>
      <View style={local.cardBottom}>
        <Text style={local.meta}>{itemCountText(order.itemCount)} · {placedText(order.orderedAt)}</Text>
        {finished && scope === "history" ? (
          <View style={[local.chip, order.status === "DELIVERED" ? local.chipSuccess : local.chipDanger]}>
            <AppIcon icon={order.status === "DELIVERED" ? PackageCheck : RefreshCw} size="sm" color={order.status === "DELIVERED" ? colors.success : colors.danger} />
            <Text style={[local.chipText, { color: order.status === "DELIVERED" ? colors.success : colors.danger }]}>{order.status === "DELIVERED" ? "Đã giao" : "Không giao được"}</Text>
          </View>
        ) : (
          <View style={local.cod}><AppIcon icon={Banknote} size="sm" color={colors.text} /><Text style={local.codText}>{codText(order.codAmount)}</Text></View>
        )}
      </View>
    </Pressable>
  );
});

const Gap = (): React.JSX.Element => <View style={{ height: spacing.md }} />;

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
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ gap: spacing.md }} accessible accessibilityLabel="Đang tải đơn hàng">
      {[0, 1, 2].map((index) => (
        <View key={index} style={local.card}>
          <Animated.View style={[local.block, { width: "70%", height: 16, opacity: pulse }]} />
          <Animated.View style={[local.block, { width: "45%", height: 12, opacity: pulse, marginTop: spacing.sm }]} />
          <View style={[local.cardBottom, { marginTop: spacing.md }]}>
            <Animated.View style={[local.block, { width: 90, height: 12, opacity: pulse }]} />
            <Animated.View style={[local.block, { width: 110, height: 18, opacity: pulse }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { ...textStyles.label },
  headerSub: { ...textStyles.caption },
  tabs: { backgroundColor: colors.surface, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg },
  content: { alignSelf: "center", maxWidth: 720, padding: spacing.lg, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.lg },
  pressed: { opacity: 0.75 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  addressRow: { alignItems: "flex-start", flex: 1, flexDirection: "row", gap: spacing.xs, minWidth: 0 },
  address: { ...textStyles.label, flex: 1 },
  distance: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  distanceText: { ...textStyles.caption, color: colors.primary, fontWeight: "700" },
  cardBottom: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  cod: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  codText: { ...textStyles.subheading },
  chip: { alignItems: "center", borderRadius: radius.pill, flexDirection: "row", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chipSuccess: { backgroundColor: colors.successSoft },
  chipDanger: { backgroundColor: colors.dangerSoft },
  chipText: { ...textStyles.caption, fontWeight: "700" },
  inlineError: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, marginBottom: spacing.md, padding: spacing.md },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl * 2 },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 56, justifyContent: "center", width: 56 },
  stateText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  stateButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
  stateButtonText: { ...textStyles.label, color: colors.primaryText },
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
});
