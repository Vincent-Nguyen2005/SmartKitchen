import React, { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banknote, Crosshair, Map as MapIcon, MapPin, Tag, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { formatVnd } from "../../services/format";
import MapPicker from "./MapPicker";
import { deliveryProblem } from "./orders";
import { reverseGeocode } from "./geocode";
import { askToEnableLocation, positionOnce } from "../../services/location";
import LocationOffBanner from "../../components/LocationOffBanner";
import { ShoppingApiError, shoppingApi, type CheckoutLine, type CheckoutPreview, type Order } from "./shoppingApi";
import { previewTotals, summaryRows, totalChangedText } from "./checkoutSummary";

type Props = {
  visible: boolean;
  familyId: string;
  accessToken: string;
  /** Cart lines with catalog details (group, shelf life) for the order. */
  lines: CheckoutLine[];
  itemCount: number;
  /** Cart total with the cart's rounding (sum of rounded line totals), before the automatic promotion. */
  total: number;
  onClose: () => void;
  onPlaced: (order: Order) => void;
};
type Point = { latitude: number; longitude: number };

/**
 * "Mua" → "Đặt hàng": delivery address (prefilled from the caller's last order, else from the device location asked
 * for now and reverse geocoded to a Vietnamese address; always editable, map picker and "Dùng vị trí hiện tại"),
 * receiver name and phone (required, Vietnamese phone), note, payment "Thanh toán khi nhận hàng" (the only option),
 * summary and "Đặt hàng". Location denied: the address is typed by hand.
 * Summary: Tạm tính, "Khuyến mãi: <tên> −<số tiền>" and Tổng thanh toán from the server's preview (automatic promotion,
 * no code), plus "Mua thêm … để được …" when a promotion is close. "Đặt hàng" sends the total shown; if the server's
 * total changed meanwhile, the new totals are shown and nothing is ordered until the user taps again.
 */
export default function CheckoutSheet({ visible, familyId, accessToken, lines, itemCount, total, onClose, onPlaced }: Props): React.JSX.Element {
  const { user } = useSession();
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState<Point | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  // Device location off: our banner (no system dialog until "Bật định vị" is tapped).
  const [locationOff, setLocationOff] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [changedNotice, setChangedNotice] = useState<string | null>(null);
  const touched = useRef(false);

  const loadPreview = async () => {
    try {
      setPreview(await shoppingApi.checkoutPreview(accessToken, familyId, lines));
    } catch {
      setPreview(null); // the cart total is shown; "Đặt hàng" still re-checks on the server
    }
  };
  // What "Đặt hàng" charges: the server's preview, else the cart total.
  const shown = preview ?? { subtotal: total, discount: 0, total, promotion: null, hint: null };

  const locate = async (): Promise<void> => {
    setLocating(true);
    setLocationNote(null);
    try {
      // One Balanced position, never a system dialog on its own (services/location.ts); address: device geocoder on
      // phones, Nominatim on web (geocode.ts).
      const { status, point: next } = await positionOnce();
      setLocationOff(status === "services-off");
      if (status === "denied") { setLocationNote("Chưa được cấp quyền vị trí. Hãy nhập địa chỉ."); return; }
      if (!next) return;
      setPoint(next);
      const text = await reverseGeocode(next);
      if (text) setAddress(text);
      else setLocationNote("Không tìm được địa chỉ cho vị trí này. Hãy nhập hoặc chọn trên bản đồ.");
    } catch {
      setLocationNote("Không lấy được vị trí. Hãy nhập địa chỉ.");
    } finally {
      setLocating(false);
    }
  };

  // Opening: last delivery details if any, else the device location; the receiver defaults to the user's name.
  const prefill = async () => {
    touched.current = false;
    setError(null);
    setChangedNotice(null);
    setPreview(null);
    void loadPreview();
    setLocationNote(null);
    setNote("");
    setReceiverName(user?.fullName?.trim() ?? "");
    setReceiverPhone("");
    setAddress("");
    setPoint(null);
    const last = await shoppingApi.lastDelivery(accessToken, familyId).then((result) => result.delivery).catch(() => null);
    if (touched.current) return;
    if (last?.receiverName) setReceiverName(last.receiverName);
    if (last?.receiverPhone) setReceiverPhone(last.receiverPhone);
    if (last?.address) {
      setAddress(last.address);
      setPoint(last.latitude !== null && last.longitude !== null ? { latitude: last.latitude, longitude: last.longitude } : null);
    } else {
      await locate();
    }
  };

  const submit = async () => {
    const problem = deliveryProblem({ address, receiverName, receiverPhone });
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    setError(null);
    setChangedNotice(null);
    try {
      const { order } = await shoppingApi.placeOrder(accessToken, familyId, lines, {
        address: address.trim(), latitude: point?.latitude ?? null, longitude: point?.longitude ?? null,
        receiverName: receiverName.trim(), receiverPhone: receiverPhone.trim(), note: note.trim() || null,
      }, shown.total);
      onPlaced(order);
    } catch (caught) {
      if (caught instanceof ShoppingApiError && caught.code === "TOTAL_CHANGED" && caught.data) {
        // A promotion started / ended / was used up: show the new totals; the next tap orders at that total.
        const next = caught.data as CheckoutPreview;
        setChangedNotice(totalChangedText(shown.total, next.total));
        setPreview(next);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Chưa đặt được hàng. Hãy thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose} onShow={() => void prefill()}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">Đặt hàng</Text>
          <View style={local.spacer} />
        </View>
        <KeyboardAvoidingView style={local.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={local.card}>
              <View style={local.cardHeader}>
                <AppIcon icon={MapPin} size="sm" color={colors.primary} />
                <Text style={local.cardTitle}>Địa chỉ giao hàng</Text>
                <IconButton icon={MapIcon} accessibilityLabel="Chọn trên bản đồ" color={colors.primary} onPress={() => setMapOpen(true)} />
              </View>
              <TextInput
                accessibilityLabel="Địa chỉ giao hàng"
                value={address}
                onChangeText={(value) => { touched.current = true; setAddress(value); }}
                placeholder={locating ? "Đang lấy vị trí…" : "Số nhà, đường, phường, quận, tỉnh"}
                placeholderTextColor={colors.muted}
                multiline
                style={[local.input, local.addressInput]}
              />
              <Pressable accessibilityRole="button" onPress={() => void locate()} disabled={locating} style={local.linkButton}>
                {locating ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={Crosshair} size="sm" color={colors.primary} />}
                <Text style={local.linkText}>Dùng vị trí hiện tại</Text>
              </Pressable>
              {locationOff ? (
                <LocationOffBanner onEnable={() => void askToEnableLocation().then((on) => { if (on) void locate(); })} />
              ) : null}
              {locationNote ? <Text style={local.note}>{locationNote}</Text> : null}
            </View>

            <View style={local.card}>
              <Text style={local.cardTitle}>Người nhận</Text>
              <TextInput accessibilityLabel="Tên người nhận" value={receiverName} onChangeText={(value) => { touched.current = true; setReceiverName(value); }} placeholder="Họ tên" placeholderTextColor={colors.muted} style={local.input} autoComplete="name" />
              <TextInput accessibilityLabel="Số điện thoại người nhận" value={receiverPhone} onChangeText={(value) => { touched.current = true; setReceiverPhone(value); }} placeholder="Số điện thoại" placeholderTextColor={colors.muted} style={local.input} keyboardType="phone-pad" autoComplete="tel" />
              <TextInput accessibilityLabel="Ghi chú cho người giao" value={note} onChangeText={setNote} placeholder="Ghi chú (không bắt buộc)" placeholderTextColor={colors.muted} style={local.input} maxLength={300} />
            </View>

            <View style={local.card}>
              <Text style={local.cardTitle}>Thanh toán</Text>
              <View style={local.payment} accessibilityRole="radio" accessibilityState={{ selected: true }}>
                <View style={local.radio}><View style={local.radioDot} /></View>
                <AppIcon icon={Banknote} size="sm" color={colors.primary} />
                <Text style={local.paymentText}>Thanh toán khi nhận hàng</Text>
              </View>
            </View>

            <View style={local.card}>
              <Text style={local.cardTitle}>{itemCount} món</Text>
              {summaryRows(previewTotals(shown)).map((row) => (
                <View key={row.key} style={[local.summaryRow, row.strong && local.totalRow]} accessible accessibilityLabel={`${row.label}: ${row.value.replace("−", "trừ ").replace("đ", " đồng")}`}>
                  <Text style={row.strong ? local.totalLabel : local.summaryLabel} numberOfLines={2}>{row.label}</Text>
                  <Text style={row.strong ? local.totalValue : [local.summaryValue, row.tone === "success" && local.success]}>{row.value}</Text>
                </View>
              ))}
              {shown.hint ? (
                <View style={local.hint} accessibilityLiveRegion="polite">
                  <AppIcon icon={Tag} size="sm" color={colors.primary} />
                  <Text style={local.hintText}>{shown.hint.text}</Text>
                </View>
              ) : null}
            </View>
            {changedNotice ? <Text style={local.changed} accessibilityRole="alert">{changedNotice}</Text> : null}
            {error ? <Text style={local.error} accessibilityRole="alert">{error}</Text> : null}
          </ScrollView>
          <View style={local.footer}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Đặt hàng, ${formatVnd(shown.total)}, thanh toán khi nhận hàng`} disabled={submitting} onPress={() => void submit()} style={[local.submit, submitting && local.disabled]}>
              {submitting ? <ActivityIndicator color={colors.primaryText} /> : <Text style={local.submitText}>Đặt hàng</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        <MapPicker
          visible={mapOpen}
          initial={point}
          onClose={() => setMapOpen(false)}
          onConfirm={(place) => { touched.current = true; setPoint({ latitude: place.latitude, longitude: place.longitude }); if (place.address) setAddress(place.address); setMapOpen(false); }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  title: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  content: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  cardTitle: { ...textStyles.label, flex: 1 },
  input: { ...textStyles.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addressInput: { minHeight: 72, textAlignVertical: "top" },
  linkButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: spacing.xs, minHeight: touchTarget },
  linkText: { ...textStyles.labelSmall, color: colors.primary },
  note: { ...textStyles.bodySmall, color: colors.warning },
  payment: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: touchTarget },
  radio: { alignItems: "center", borderColor: colors.primary, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: "center", width: 20 },
  radioDot: { backgroundColor: colors.primary, borderRadius: 5, height: 10, width: 10 },
  paymentText: { ...textStyles.body },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" },
  summaryLabel: { ...textStyles.bodySmall, color: colors.muted, flex: 1, minWidth: 0 },
  summaryValue: { ...textStyles.bodySmall, textAlign: "right" },
  success: { color: colors.success, fontWeight: "700" },
  hint: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, padding: spacing.sm },
  hintText: { ...textStyles.bodySmall, color: colors.primary, flex: 1 },
  changed: { ...textStyles.bodySmall, backgroundColor: colors.warningSoft, borderRadius: radius.sm, color: colors.warning, padding: spacing.md },
  totalRow: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.sm },
  totalLabel: { ...textStyles.label, flex: 1 },
  totalValue: { ...textStyles.subheading },
  error: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, padding: spacing.lg },
  submit: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: 48 },
  submitText: { ...textStyles.label, color: colors.primaryText },
  disabled: { opacity: 0.6 },
});
