import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Crosshair, Navigation, Route as RouteIcon, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import MapFrame from "../../components/MapFrame";
import { loadRoute, routeMapHtml, routeSummary, type Point, type Route } from "./shipper";

type Props = {
  /** The customer's pin; the map is closed while null. */
  customer: Point | null;
  address: string | null;
  onClose: () => void;
  /** "Chỉ đường": the device's map app (as in the order detail). */
  onDirections: () => void;
};

/**
 * Full-screen map for the shipper: the customer's pin, the shipper's position (location asked here) and the route
 * between them from the public OSRM demo server (driving), with distance and ETA; a dashed straight line with the
 * straight-line distance when routing fails. Loaded once on open and again on "Vị trí của tôi"; no live tracking.
 */
export default function ShipperRouteMap({ customer, address, onClose, onDirections }: Props): React.JSX.Element {
  const [me, setMe] = useState<Point | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const locate = useCallback(async () => {
    if (!customer) return;
    setBusy(true);
    setMessage(null);
    try {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setMessage("Chưa được cấp quyền vị trí: chỉ hiện vị trí của khách."); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setMe(point);
      setRoute(await loadRoute(point, customer));
    } catch {
      setMessage("Không lấy được vị trí của bạn.");
    } finally {
      setBusy(false);
    }
  }, [customer]);

  return (
    <Modal animationType="slide" visible={customer !== null} onRequestClose={onClose} onShow={() => { setMe(null); setRoute(null); void locate(); }}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng bản đồ" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Bản đồ giao hàng</Text>
          <View style={local.spacer} />
        </View>
        {customer ? <MapFrame html={routeMapHtml(customer, me, route)} style={local.map} accessibilityLabel="Bản đồ đường đi tới khách" /> : null}
        <View style={local.footer}>
          {address ? <Text style={local.address} numberOfLines={2}>{address}</Text> : null}
          <View style={local.summaryRow}>
            <AppIcon icon={RouteIcon} size="sm" color={colors.primary} />
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={local.summary}>{route ? routeSummary(route) : message ?? "Chưa có vị trí của bạn"}</Text>}
          </View>
          {route && message ? <Text style={local.note}>{message}</Text> : null}
          <View style={local.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void locate()} style={[local.secondary, busy && local.disabled]}>
              <AppIcon icon={Crosshair} size="sm" color={colors.primary} />
              <Text style={local.secondaryText}>Vị trí của tôi</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDirections} style={local.primary}>
              <AppIcon icon={Navigation} size="sm" color={colors.primaryText} />
              <Text style={local.primaryText}>Chỉ đường</Text>
            </Pressable>
          </View>
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
  actions: { flexDirection: "row", gap: spacing.sm },
  secondary: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget },
  secondaryText: { ...textStyles.labelSmall, color: colors.primary },
  primary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget },
  primaryText: { ...textStyles.labelSmall, color: colors.primaryText },
  disabled: { opacity: 0.5 },
});
