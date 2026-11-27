import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Crosshair, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import MapFrame, { type MapFrameHandle } from "../../components/MapFrame";
import { reverseGeocode } from "./geocode";
import { askToEnableLocation, positionOnce } from "../../services/location";
import LocationOffBanner from "../../components/LocationOffBanner";
import { DEFAULT_CENTER, mapPickerHtml, parsePinMessage } from "./orders";

type Point = { latitude: number; longitude: number };
type Props = {
  visible: boolean;
  /** Where the pin starts (the current address, else Hồ Chí Minh City). */
  initial: Point | null;
  onClose: () => void;
  onConfirm: (place: Point & { address: string }) => void;
};
/** Reverse geocode only after the pin rests this long (web: Nominatim allows about one request a second). */
const GEOCODE_DELAY_MS = 800;

/**
 * Full-screen map with a draggable pin (OpenStreetMap / Leaflet; phones: WebView, web: iframe, via MapFrame). Moving
 * the pin reverse geocodes it (phones: the device geocoder; web: Nominatim). "Dùng vị trí hiện tại" moves the pin to
 * the device position (phones: expo-location; web: the browser's geolocation). "Xác nhận vị trí" returns lat / lng
 * and the address.
 */
export default function MapPicker({ visible, initial, onClose, onConfirm }: Props): React.JSX.Element {
  const frame = useRef<MapFrameHandle>(null);
  const [pin, setPin] = useState<Point | null>(initial);
  const [address, setAddress] = useState("");
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const lookup = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page is built once per opening (the pin then moves inside it).
  const html = useMemo(() => mapPickerHtml(initial ?? DEFAULT_CENTER), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const geocodeSoon = useCallback((point: Point) => {
    if (timer.current) clearTimeout(timer.current);
    setLooking(true);
    const id = ++lookup.current;
    timer.current = setTimeout(() => {
      void reverseGeocode(point).then((text) => {
        if (id !== lookup.current) return;
        setAddress(text);
        setLooking(false);
      });
    }, GEOCODE_DELAY_MS);
  }, []);

  const onMessage = useCallback((data: string) => {
    const point = parsePinMessage(data);
    if (!point) return;
    setPin(point);
    setMessage(null);
    geocodeSoon(point);
  }, [geocodeSoon]);

  const useCurrentLocation = async () => {
    setBusy(true);
    setMessage(null);
    const { status, point } = await positionOnce();
    setBusy(false);
    setLocationOff(status === "services-off");
    if (status === "denied") { setMessage("Chưa được cấp quyền vị trí. Hãy kéo ghim trên bản đồ."); return; }
    if (!point) return;
    // The page moves the pin and answers with the new position (→ onMessage → address).
    frame.current?.postMessage(JSON.stringify(point));
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} onShow={() => { setPin(initial); setAddress(""); setMessage(null); setLocationOff(false); if (initial) geocodeSoon(initial); }}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng bản đồ" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Chọn vị trí giao hàng</Text>
          <View style={local.spacer} />
        </View>
        <View style={local.map}>
          <MapFrame ref={frame} html={html} onMessage={onMessage} style={local.frame} accessibilityLabel="Bản đồ chọn vị trí giao hàng" />
          <Pressable accessibilityRole="button" accessibilityLabel="Dùng vị trí hiện tại" onPress={() => void useCurrentLocation()} style={local.locate}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={Crosshair} color={colors.primary} />}
            <Text style={local.locateText}>Dùng vị trí hiện tại</Text>
          </Pressable>
        </View>
        <View style={local.footer}>
          <Text style={local.hint}>Kéo ghim hoặc chạm vào bản đồ để chọn vị trí.</Text>
          {locationOff ? <LocationOffBanner onEnable={() => void askToEnableLocation().then((on) => { if (on) void useCurrentLocation(); })} /> : null}
          {message ? <Text style={local.message} accessibilityRole="alert">{message}</Text> : null}
          <Text style={local.address} numberOfLines={3}>{looking ? "Đang tìm địa chỉ…" : address || (pin ? "Không tìm được địa chỉ, bạn có thể nhập tay sau." : "Chưa chọn vị trí")}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={!pin}
            onPress={() => { if (pin) onConfirm({ ...pin, address }); }}
            style={[local.confirm, !pin && local.disabled]}
          >
            <Text style={local.confirmText}>Xác nhận vị trí</Text>
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
  frame: { flex: 1 },
  locate: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, bottom: spacing.lg, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.lg, position: "absolute", right: spacing.lg },
  locateText: { ...textStyles.labelSmall, color: colors.primary },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, padding: spacing.lg },
  hint: { ...textStyles.caption },
  message: { ...textStyles.bodySmall, color: colors.warning },
  address: { ...textStyles.body },
  confirm: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget },
  confirmText: { ...textStyles.label, color: colors.primaryText },
  disabled: { opacity: 0.5 },
});
