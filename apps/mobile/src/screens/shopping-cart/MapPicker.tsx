import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Crosshair, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { addressText, DEFAULT_CENTER, mapPickerHtml, parsePinMessage } from "./orders";

type Point = { latitude: number; longitude: number };
type Props = {
  visible: boolean;
  /** Where the pin starts (the current address, else the device location, else Hồ Chí Minh City). */
  initial: Point | null;
  onClose: () => void;
  onConfirm: (place: Point & { address: string }) => void;
};

/**
 * Full-screen map with a draggable pin (OpenStreetMap / Leaflet in a WebView; no API key). Moving the pin reverse
 * geocodes it on the device (expo-location) to a Vietnamese address. "Dùng vị trí hiện tại" moves the pin to the
 * phone's location (asks for permission then).
 */
export default function MapPicker({ visible, initial, onClose, onConfirm }: Props): React.JSX.Element {
  // WebView<{}>: the default generic (P) would make its props `never` once a ref is attached.
  const webView = useRef<WebView<{}>>(null);
  const [pin, setPin] = useState<Point | null>(initial);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lookup = useRef(0);
  // The page is built once per opening (the pin then moves inside it).
  const html = useMemo(() => mapPickerHtml(initial ?? DEFAULT_CENTER), [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const geocode = async (point: Point) => {
    const id = ++lookup.current;
    try {
      const Location = await import("expo-location");
      const [place] = await Location.reverseGeocodeAsync(point);
      if (id === lookup.current) setAddress(addressText(place));
    } catch {
      if (id === lookup.current) setAddress("");
    }
  };

  const onMessage = (data: string) => {
    const point = parsePinMessage(data);
    if (!point) return;
    setPin(point);
    setMessage(null);
    void geocode(point);
  };

  const useCurrentLocation = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const Location = await import("expo-location");
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setMessage("Chưa được cấp quyền vị trí. Hãy kéo ghim trên bản đồ."); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      webView.current?.postMessage(JSON.stringify(point));
    } catch {
      setMessage("Không lấy được vị trí hiện tại. Hãy kéo ghim trên bản đồ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} onShow={() => { setPin(initial); setAddress(""); if (initial) void geocode(initial); }}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng bản đồ" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Chọn vị trí giao hàng</Text>
          <View style={local.spacer} />
        </View>
        <View style={local.map}>
          <WebView ref={webView} originWhitelist={["*"]} source={{ html }} onMessage={(event) => onMessage(event.nativeEvent.data)} javaScriptEnabled domStorageEnabled />
          <Pressable accessibilityRole="button" accessibilityLabel="Dùng vị trí hiện tại" onPress={() => void useCurrentLocation()} style={local.locate}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={Crosshair} color={colors.primary} />}
            <Text style={local.locateText}>Dùng vị trí hiện tại</Text>
          </Pressable>
        </View>
        <View style={local.footer}>
          <Text style={local.hint}>Kéo ghim hoặc chạm vào bản đồ để chọn vị trí.</Text>
          {message ? <Text style={local.message} accessibilityRole="alert">{message}</Text> : null}
          <Text style={local.address} numberOfLines={3}>{address || (pin ? "Đang tìm địa chỉ…" : "Chưa chọn vị trí")}</Text>
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
