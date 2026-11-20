import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Camera, FileImage, ScanLine, X } from "lucide-react-native";
import { AppIcon, colors, spacing, textStyles, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
import { inventoryApi, type InventoryUnit, type ReceiptMimeType } from "./inventoryApi";
import { parseReceiptQr } from "./receiptQr";

type Draft = { id: string; name: string; quantity: string; unit: InventoryUnit; selected: boolean };
type Props = { familyId: string | null; accessToken: string | null; onSaved: () => void; onClose: () => void };
const units: InventoryUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const unitLabels: Record<InventoryUnit, string> = {
  PIECE: "Cái", PACK: "Gói", BOX: "Hộp", BOTTLE: "Chai", CAN: "Lon", GRAM: "Gram", KILOGRAM: "Kg", MILLILITER: "Ml", LITER: "Lít",
};

export default function ReceiptQrCapturePanel({ familyId, accessToken, onSaved, onClose }: Props): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const scanLocked = useRef(false);
  const saving = useRef(false);
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openScanner = async () => {
    if (busy || saving.current) return;
    setStarting(true);
    setMessage(null);
    try {
      const granted = permission?.granted ? permission : await requestPermission();
      if (!granted.granted) {
        setMessage("Chưa có quyền camera. Bạn vẫn có thể chọn ảnh hóa đơn để đọc danh sách hàng.");
        return;
      }
      scanLocked.current = false;
      setScanning(true);
    } catch {
      setMessage("Không mở được camera. Bạn có thể chọn ảnh hóa đơn để đọc danh sách hàng.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (familyId && accessToken) void openScanner();
    else setStarting(false);
    return () => { if (pickerTimer.current) clearTimeout(pickerTimer.current); };
  }, []);

  const onQrScanned = (value: string) => {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setScanning(false);
    const items = parseReceiptQr(value);
    if (!items) {
      setDrafts([]);
      setMessage("QR này không chứa danh sách sản phẩm có thể đọc trực tiếp (có thể chỉ là link xuất/tra cứu hóa đơn). Hãy chụp hoặc chọn ảnh bill để nhận diện các món; ứng dụng không tự lưu gì từ QR này.");
      return;
    }
    setDrafts(items.map((item, index) => ({ id: `qr-${index}`, name: item.name, quantity: String(item.quantity), unit: item.unit, selected: true })));
    setMessage(`Đọc được ${items.length} sản phẩm từ QR. Kiểm tra và chỉnh sửa trước khi lưu.`);
  };

  const readBillPhoto = async (source: "camera" | "library", chosenAsset?: ImagePicker.ImagePickerAsset) => {
    setMessage(null);
    try {
      if (source === "camera") {
        const granted = await ImagePicker.requestCameraPermissionsAsync();
        if (!granted.granted) { setMessage("Chưa có quyền camera. Hãy chọn ảnh hóa đơn từ thư viện."); return; }
      }
      let asset = chosenAsset;
      if (!asset) {
        const result = source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 });
        if (result.canceled || !result.assets[0]) return;
        asset = result.assets[0];
      }
      if (!asset.base64 || asset.base64.length > 7_000_000) { setMessage("Ảnh quá lớn hoặc không đọc được. Hãy chọn ảnh nhỏ hơn 5 MB."); return; }
      const mime = asset.mimeType?.toLowerCase() ?? (asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) { setMessage("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP."); return; }
      if (!accessToken) { setMessage("Đăng nhập trước khi đọc hóa đơn."); return; }
      setBusy(true);
      const recognized = await inventoryApi.recognizeReceipt(accessToken, asset.base64, mime as ReceiptMimeType);
      setDrafts(recognized.items.map((item, index) => ({ id: `photo-${index}`, name: item.name, quantity: String(item.quantity), unit: item.unit, selected: true })));
      setMessage(recognized.items.length ? `Nhận diện được ${recognized.items.length} dòng từ ảnh bill. Kiểm tra và chỉnh sửa trước khi lưu.` : "Không nhận diện được sản phẩm. Hãy chụp rõ toàn bộ hóa đơn và thử lại.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không đọc được hóa đơn. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const chooseImageFromScanner = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      try {
        const qr = await scanFromURLAsync(asset.uri, ["qr"]);
        if (qr.length) { onQrScanned(qr[0].data); return; }
      } catch { /* Ảnh không có QR đọc được: thử nhận diện nội dung hóa đơn. */ }
      await readBillPhoto("library", asset);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không mở được ảnh. Hãy thử lại.");
    }
  };

  const updateDraft = (id: string, change: Partial<Draft>) => setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...change } : draft));
  const selected = drafts.filter((draft) => draft.selected);

  const saveSelected = async () => {
    if (!familyId || !accessToken || saving.current) return;
    if (!selected.length) { setMessage("Hãy chọn ít nhất một sản phẩm để lưu."); return; }
    const invalid = selected.find((draft) => !draft.name.trim() || !Number.isFinite(Number(draft.quantity.replace(",", "."))) || Number(draft.quantity.replace(",", ".")) <= 0);
    if (invalid) { setMessage("Kiểm tra lại tên và số lượng (phải lớn hơn 0) của từng sản phẩm."); return; }
    saving.current = true;
    setBusy(true);
    setMessage(null);
    let saved = 0;
    try {
      for (const draft of selected) {
        await inventoryApi.create(accessToken, {
          familyId, name: draft.name.trim(), quantity: Number(draft.quantity.replace(",", ".")), unit: draft.unit, storageLocation: "PANTRY",
        });
        saved += 1;
        setDrafts((current) => current.filter((item) => item.id !== draft.id));
        onSaved();
      }
      setMessage(`Đã lưu ${saved} sản phẩm vào kho.`);
    } catch (error) {
      setMessage(`Đã lưu ${saved}/${selected.length} sản phẩm. Các món chưa lưu vẫn còn trong danh sách. ${error instanceof Error ? error.message : "Hãy thử lại."}`);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  if (starting) return (
    <SafeAreaView style={styles.cameraScreen}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng máy quét QR" onPress={onClose} style={styles.close}><AppIcon icon={X} size="md" color={colors.surface} /></Pressable>
      <View style={styles.loading}><ActivityIndicator color={colors.surface} /><Text style={styles.cameraHint}>Đang mở camera quét QR…</Text></View>
    </SafeAreaView>
  );

  if (scanning) return (
    <View style={styles.cameraScreen}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => onQrScanned(data)} onMountError={() => { setScanning(false); setMessage("Không mở được máy quét QR. Hãy thử lại hoặc chọn ảnh bill."); }} />
      <SafeAreaView style={styles.cameraOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng máy quét QR" onPress={onClose} style={styles.close}><AppIcon icon={X} size="md" color={colors.surface} /></Pressable>
        <View style={styles.cameraCenter}><View style={styles.target} /><Text style={styles.cameraHint}>Đưa QR trên hóa đơn vào khung</Text></View>
        <Pressable accessibilityRole="button" onPress={() => { setScanning(false); pickerTimer.current = setTimeout(() => { void chooseImageFromScanner(); }, 300); }} style={styles.chooseImage}>
          <AppIcon icon={FileImage} size="sm" color={colors.text} /><Text style={styles.chooseImageText}>Chọn ảnh</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );

  return (
    <SafeAreaView style={styles.reviewScreen}>
      <View style={styles.reviewHeader}><Text style={styles.heading}>Quét QR hóa đơn</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose}><AppIcon icon={X} size="md" color={colors.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panel}>
      {!familyId || !accessToken ? <Text style={styles.info}>Đăng nhập và tham gia gia đình để thêm sản phẩm từ hóa đơn.</Text> : <>
        <Text style={styles.info}>Quét QR trên bill để xem các món. Nếu QR chỉ dẫn đến trang xuất hóa đơn, hãy dùng ảnh bill.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void openScanner(); }} style={[styles.primaryButton, busy && styles.disabled]}>
          <AppIcon icon={ScanLine} size="sm" color={colors.surface} /><Text style={styles.primaryText}>Quét QR hóa đơn</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void readBillPhoto("camera"); }} style={styles.secondaryButton}><AppIcon icon={Camera} size="sm" color={colors.primary} /><Text style={styles.secondaryText}>Chụp bill</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void readBillPhoto("library"); }} style={styles.secondaryButton}><AppIcon icon={FileImage} size="sm" color={colors.primary} /><Text style={styles.secondaryText}>Chọn ảnh bill</Text></Pressable>
        </View>
        {message && <Text accessibilityRole="alert" style={styles.info}>{message}</Text>}
        {drafts.length > 0 && <>
          <Text style={styles.heading}>Sản phẩm trên hóa đơn ({drafts.length})</Text>
          {drafts.map((draft, index) => <View key={draft.id} style={styles.card}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.selected }} onPress={() => updateDraft(draft.id, { selected: !draft.selected })} style={styles.checkRow}>
              <Text style={styles.checkText}>{draft.selected ? "☑" : "☐"} Món {index + 1}</Text>
            </Pressable>
            <TextInput accessibilityLabel={`Tên sản phẩm ${index + 1}`} value={draft.name} onChangeText={(name) => updateDraft(draft.id, { name })} placeholder="Tên sản phẩm" style={styles.input} />
            <View style={styles.actions}>
              <TextInput accessibilityLabel={`Số lượng sản phẩm ${index + 1}`} value={draft.quantity} onChangeText={(quantity) => updateDraft(draft.id, { quantity })} keyboardType="decimal-pad" style={[styles.input, styles.quantity]} />
              <View style={styles.unit}><RadioDropdown<InventoryUnit> label="Đơn vị" value={draft.unit} options={units.map((unit) => ({ value: unit, label: unitLabels[unit] }))} onChange={(unit) => updateDraft(draft.id, { unit })} /></View>
            </View>
          </View>)}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void saveSelected(); }} style={[styles.primaryButton, busy && styles.disabled]}>
            <Text style={styles.primaryText}>Lưu {selected.length} sản phẩm đã chọn vào kho</Text>
          </Pressable>
        </>}
        {busy && <ActivityIndicator color={colors.primary} />}
      </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, padding: spacing.lg },
  reviewScreen: { backgroundColor: colors.surface, flex: 1 },
  reviewHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: spacing.lg },
  info: { ...typography.bodySmall, color: colors.muted },
  heading: { ...textStyles.subheading, color: colors.text, marginTop: spacing.sm },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 8, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 48, padding: spacing.md },
  primaryText: { ...typography.labelSmall, color: colors.surface, textAlign: "center" },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  secondaryButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 8, flexDirection: "row", gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  secondaryText: { ...typography.labelSmall, color: colors.primary },
  card: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  checkRow: { minHeight: 36, justifyContent: "center" },
  checkText: { ...typography.labelSmall, color: colors.primary },
  input: { ...typography.bodySmall, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.text, minHeight: 44, paddingHorizontal: spacing.md },
  quantity: { minWidth: 85, width: 90 },
  unit: { flex: 1, minWidth: 150 },
  disabled: { opacity: 0.6 },
  cameraScreen: { backgroundColor: colors.text, flex: 1 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center", gap: spacing.md },
  cameraOverlay: { flex: 1 },
  close: { alignItems: "center", alignSelf: "flex-end", backgroundColor: colors.overlay, borderRadius: 28, height: 48, justifyContent: "center", margin: spacing.lg, width: 48 },
  cameraCenter: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  target: { aspectRatio: 1, borderColor: colors.surface, borderRadius: 20, borderWidth: 2, maxWidth: 280, width: "100%" },
  cameraHint: { ...typography.labelSmall, backgroundColor: colors.overlay, borderRadius: 8, color: colors.surface, marginTop: spacing.lg, padding: spacing.md },
  chooseImage: { alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderRadius: 24, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginBottom: spacing.xl, minHeight: 48, paddingHorizontal: spacing.lg },
  chooseImageText: { ...typography.labelSmall, color: colors.text },
});
