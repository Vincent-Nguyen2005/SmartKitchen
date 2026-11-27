import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Crosshair, Route as RouteIcon, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import MapFrame from "../../components/MapFrame";
import LocationOffBanner from "../../components/LocationOffBanner";
import { askToEnableLocation, positionOnce } from "../../services/location";
import { LOCATION_DENIED_TEXT } from "../../services/locationState";
import { loadRoute, routeMapHtml, routeSummary, type Point, type Route } from "./shipper";

type Props = {
  /** The customer's pin; the map is closed while null. */
  customer: Point | null;
  address: string | null;
  onClose: () => void;
  /** The small "Mở bằng ứng dụng bản đồ" link: the device's map app, only when tapped. */
  onOpenExternal: () => void;
};

/**
 * Full-screen in-app map for the shipper: the customer's pin, the shipper's position and the route between them from
 * the public OSRM demo server (driving), with distance and ETA; a dashed straight line when routing fails. Location:
 * checked first (device location off → our banner, the system prompt only on "Bật định vị"), one Balanced position,
 * no tracking. Without a position: just the pin and the address. Never opens another app by itself.
 */
export default function ShipperRouteMap({ customer, address, onClose, onOpenExternal }: Props): React.JSX.Element {
  const [me, setMe] = useState<Point | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const [denied, setDenied] = useState(false);

  const locate = useCallback(async () => {
    if (!customer) return;
    setBusy(true);
    const { status, point } = await positionOnce();
    setLocationOff(status === "services-off");
    setDenied(status === "denied");
    if (point) {
      setMe(point);
      setRoute(await loadRoute(point, customer));
    }
    setBusy(false);
  }, [customer]);

  return (
    <Modal animationType="slide" visible={customer !== null} onRequestClose={onClose} onShow={() => { setMe(null); setRoute(null); setLocationOff(false); setDenied(false); void locate(); }}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng bản đồ" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Bản đồ giao hàng</Text>
          <View style={local.spacer} />
        </View>
        {customer ? <MapFrame html={routeMapHtml(customer, me, route)} style={local.map} accessibilityLabel="Bản đồ đường đi tới khách" /> : null}
        <View style={local.footer}>
          {locationOff ? <LocationOffBanner busy={busy} onEnable={() => void askToEnableLocation().then((on) => { if (on) void locate(); })} /> : null}
          {address ? <Text style={local.address} numberOfLines={2}>{address}</Text> : null}
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : route ? (
            <View style={local.summaryRow}>
              <AppIcon icon={RouteIcon} size="sm" color={colors.primary} />
              <Text style={local.summary}>{routeSummary(route)}</Text>
            </View>
          ) : denied ? <Text style={local.note}>{LOCATION_DENIED_TEXT}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void locate()} style={[local.secondary, busy && local.disabled]}>
            <AppIcon icon={Crosshair} size="sm" color={colors.primary} />
            <Text style={local.secondaryText}>Vị trí của tôi</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={onOpenExternal} style={local.link}>
            <Text style={local.linkText}>Mở bằng ứng dụng bản đồ</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  title: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  map: { flex: 1 },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, padding: spacing.lg },
  address: { ...textStyles.label },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 24 },
  summary: { ...textStyles.body, color: colors.primary, fontWeight: "700" },
  note: { ...textStyles.caption },
  secondary: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget },
  secondaryText: { ...textStyles.labelSmall, color: colors.primary },
  link: { alignItems: "center", alignSelf: "center", justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  linkText: { ...textStyles.caption, color: colors.muted, textDecorationLine: "underline" },
  disabled: { opacity: 0.5 },
});
