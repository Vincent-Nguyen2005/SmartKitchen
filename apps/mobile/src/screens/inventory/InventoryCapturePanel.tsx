import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, FileImage, Mic, Receipt, ScanBarcode, Search, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, spacing, textStyles, touchTarget, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
import { inventoryApi, InventoryUnit, ReceiptMimeType } from "./inventoryApi";

type Mode = "photo" | "barcode" | "receipt" | "voice";
type Props = { familyId: string | null; accessToken: string | null; onSaved: () => void };
type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
type ReceiptDraft = { id: string; name: string; quantity: string; unit: InventoryUnit; sourceText: string };

const units: InventoryUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const unitLabels: Record<InventoryUnit, string> = {
  PIECE: "Cái", PACK: "Gói", BOX: "Hộp", BOTTLE: "Chai", CAN: "Lon",
  GRAM: "Gram", KILOGRAM: "Kg", MILLILITER: "Ml", LITER: "Lít",
};

function parseVoiceDraft(text: string): { name: string; quantity: string; unit: InventoryUnit } {
  const match = text.trim().match(/^(\d+(?:[,.]\d+)?)\s*(kg|kilogram|cân|gram|g|ml|milliliter|lít|lit|l)\s+(.+)$/i);
  if (!match) return { name: text.trim(), quantity: "1", unit: "PIECE" };
  const spokenUnit = match[2].toLowerCase();
  const unit: InventoryUnit = ["kg", "kilogram", "cân"].includes(spokenUnit) ? "KILOGRAM"
    : ["gram", "g"].includes(spokenUnit) ? "GRAM"
      : ["ml", "milliliter"].includes(spokenUnit) ? "MILLILITER"
        : ["lít", "lit", "l"].includes(spokenUnit) ? "LITER" : "PIECE";
  return { name: match[3].trim(), quantity: match[1].replace(",", "."), unit };
}

export default function InventoryCapturePanel({ familyId, accessToken, onSaved }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const [mode, setMode] = useState<Mode>("photo");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<InventoryUnit>("PIECE");
  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState("");
  const [receiptDrafts, setReceiptDrafts] = useState<ReceiptDraft[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const speechModule = useRef<SpeechModule | null>(null);
  const speechSubscriptions = useRef<Array<{ remove: () => void }>>([]);
  const lastScannedBarcode = useRef("");

  const clearSpeechSubscriptions = () => {
    speechSubscriptions.current.forEach((subscription) => subscription.remove());
    speechSubscriptions.current = [];
  };

  useEffect(() => () => {
    clearSpeechSubscriptions();
    try { speechModule.current?.abort(); } catch { /* Native speech module may be unavailable in Expo Go. */ }
  }, []);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setNote(null);
    setCameraActive(false);
    setName("");
    setBarcodeResult(null);
  };

  const lookupBarcode = async (rawBarcode: string) => {
    const value = rawBarcode.trim();
    setBarcode(value);
    setName("");
    setNote(null);
    setBarcodeResult(null);
    if (!/^\d{8,14}$/.test(value)) {
      setNote("Mã vạch phải gồm 8 đến 14 chữ số.");
      return;
    }
    if (!accessToken) { setNote("Đăng nhập để tra cứu và lưu thực phẩm."); return; }
    setBusy(true);
    try {
      const result = await inventoryApi.lookupBarcode(accessToken, value);
      if (result.found && result.product) {
        setName(result.product.name);
        setBarcodeResult(`Đã tìm thấy trên ${result.source}${result.product.brand ? ` • ${result.product.brand}` : ""}. Kiểm tra tên sản phẩm trước khi lưu.`);
      } else {
        setName("");
        setBarcodeResult("Chưa tìm được tên sản phẩm cho mã này. Hãy chụp sản phẩm hoặc thử mã khác.");
      }
    } catch (error) {
      setBarcodeResult("Không tra cứu được lúc này. Hãy thử lại sau.");
      setNote(error instanceof Error ? error.message : "Không tra cứu được mã vạch.");
    } finally {
      setBusy(false);
    }
  };

  const startBarcodeCamera = async () => {
    setNote(null);
    try {
      const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permission.granted) {
        setNote("Chưa được cấp quyền camera. Bạn có thể nhập mã vạch bằng tay bên dưới.");
        setCameraActive(false);
        return;
      }
      lastScannedBarcode.current = "";
      setCameraActive(true);
    } catch {
      setNote("Không mở được camera. Bạn có thể nhập mã vạch bằng tay bên dưới.");
      setCameraActive(false);
    }
  };

  const handleBarcodeScanned = (value: string) => {
    if (!value || lastScannedBarcode.current === value) return;
    lastScannedBarcode.current = value;
    setCameraActive(false);
    setBarcode(value);
    void lookupBarcode(value);
  };

  const saveItem = async (itemName: string, itemQuantity: string, itemUnit: InventoryUnit, itemBarcode?: string) => {
    const parsedQuantity = Number(itemQuantity.replace(",", "."));
    if (!familyId || !accessToken) { setNote("Đăng nhập và tạo hoặc tham gia gia đình để lưu vào kho."); return false; }
    if (!itemName.trim()) { setNote("Nhập tên thực phẩm trước khi lưu."); return false; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { setNote("Số lượng phải lớn hơn 0."); return false; }
    setBusy(true);
    setNote(null);
    try {
      await inventoryApi.create(accessToken, {
        familyId,
        name: itemName.trim(),
        quantity: parsedQuantity,
        unit: itemUnit,
        storageLocation: "PANTRY",
        ...(itemBarcode ? { barcode: itemBarcode } : {}),
      });
      onSaved();
      return true;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Không lưu được thực phẩm. Thử lại nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveMainDraft = async () => {
    const itemBarcode = mode === "barcode" ? barcode : undefined;
    const saved = await saveItem(name, quantity, unit, itemBarcode);
    if (!saved) return;
    setName("");
    setQuantity("1");
    setBarcode("");
    setBarcodeResult(null);
    setVoiceText("");
    setNote("Đã xác nhận và thêm thực phẩm vào kho.");
  };

  const scanReceipt = async (source: "camera" | "library", productPhoto = false) => {
    setNote(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote("Chưa được cấp quyền camera. Hãy cấp quyền rồi thử lại."); return; }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { setNote("Chưa được cấp quyền ảnh. Hãy chụp hóa đơn bằng camera."); return; }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const imageBase64 = asset?.base64;
      if (!imageBase64) { setNote("Không đọc được dữ liệu ảnh. Hãy chụp lại."); return; }
      if (imageBase64.length > 7_000_000) { setNote("Ảnh quá lớn. Hãy chụp ảnh nhỏ hơn 5 MB."); return; }
      const reportedMimeType = asset.mimeType?.toLowerCase();
      const extension = (asset.fileName ?? asset.uri).split(/[?#]/)[0].match(/\.([^.]+)$/)?.[1]?.toLowerCase();
      const extensionMimeType: Record<string, ReceiptMimeType> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      const mimeType = reportedMimeType
        ? (["image/jpeg", "image/png", "image/webp"].includes(reportedMimeType) ? reportedMimeType as ReceiptMimeType : undefined)
        : extension ? extensionMimeType[extension] : undefined;
      if (!mimeType) { setNote("Ảnh cần ở định dạng JPEG, PNG hoặc WebP. Hãy chụp lại."); return; }
      if (!accessToken) { setNote("Đăng nhập để xử lý hóa đơn."); return; }
      setBusy(true);
      setReceiptDrafts([]);
      setReceiptText("");
      const recognized = await inventoryApi.recognizeReceipt(accessToken, imageBase64, mimeType);
      if (productPhoto) {
        const detectedName = recognized.items[0]?.name.trim() ?? "";
        setName(detectedName);
        setQuantity("1");
        setUnit("PIECE");
        setNote(detectedName ? "Tên sản phẩm được đọc từ ảnh. Kiểm tra tên, rồi nhập số lượng và đơn vị." : "Không đọc được tên sản phẩm từ ảnh. Hãy chụp rõ mặt trước sản phẩm hoặc quét mã vạch.");
        return;
      }
      setReceiptText(recognized.rawText);
      setReceiptDrafts(recognized.items.map((item, index) => ({
        id: `${Date.now()}-${index}`,
        name: item.name,
        quantity: String(item.quantity),
        unit: item.unit,
        sourceText: item.sourceText,
      })));
      setNote(recognized.items.length ? `Nhận diện được ${recognized.items.length} dòng. Hãy kiểm tra từng dòng trước khi lưu.` : "Chưa nhận diện được mặt hàng. Hãy chọn ảnh rõ hơn.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Không đọc được ảnh. Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const updateReceiptDraft = (id: string, field: "name" | "quantity" | "unit", value: string) => {
    setReceiptDrafts((current) => current.map((draft) => draft.id !== id ? draft : {
      ...draft,
      [field]: field === "unit" ? value as InventoryUnit : value,
    }));
  };

  const saveReceiptDraft = async (draft: ReceiptDraft) => {
    const saved = await saveItem(draft.name, draft.quantity, draft.unit);
    if (saved) {
      setReceiptDrafts((current) => current.filter((entry) => entry.id !== draft.id));
      setNote(`Đã xác nhận và thêm ${draft.name.trim()} vào kho.`);
    }
  };

  const setVoiceDraft = (transcript: string) => {
    const clean = transcript.trim();
    setVoiceText(clean);
    if (!clean) return;
    const parsed = parseVoiceDraft(clean);
    setName(parsed.name);
    setQuantity(parsed.quantity);
    setUnit(parsed.unit);
  };

  const startVoice = async () => {
    setNote(null);
    if (recognizing) {
      speechModule.current?.stop();
      return;
    }
    try {
      const { ExpoSpeechRecognitionModule } = await import("expo-speech-recognition");
      speechModule.current = ExpoSpeechRecognitionModule;
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable() || !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        setNote("Thiết bị chưa hỗ trợ nhận dạng tiếng Việt trên máy. Hãy chụp sản phẩm hoặc quét mã vạch.");
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) { setNote("Chưa được cấp quyền micro hoặc nhận dạng giọng nói."); return; }
      clearSpeechSubscriptions();
      speechSubscriptions.current = [
        ExpoSpeechRecognitionModule.addListener("result", (event) => {
          setVoiceDraft(event.results[0]?.transcript ?? "");
        }),
        ExpoSpeechRecognitionModule.addListener("end", () => setRecognizing(false)),
        ExpoSpeechRecognitionModule.addListener("error", (event) => {
          setRecognizing(false);
          setNote(`Không nhận dạng được giọng nói (${event.error}). Hãy thử lại hoặc chụp sản phẩm.`);
        }),
        ExpoSpeechRecognitionModule.addListener("nomatch", () => {
          setRecognizing(false);
          setNote("Chưa nghe rõ tên thực phẩm. Hãy thử lại hoặc chụp sản phẩm.");
        }),
      ];
      ExpoSpeechRecognitionModule.start({ lang: "vi-VN", interimResults: true, continuous: false, requiresOnDeviceRecognition: true });
      setRecognizing(true);
      setNote("Đang nhận dạng trên thiết bị. Nói tên thực phẩm, ví dụ: ‘2 kg gạo’.");
    } catch {
      setRecognizing(false);
      setNote("Chưa có module giọng nói trong bản ứng dụng này. Hãy chụp sản phẩm hoặc quét mã vạch.");
    }
  };

  const showMainDraft = !!name.trim() && (mode === "photo" || mode === "barcode" || mode === "voice");

  return (
    <View style={[styles.panel, { padding: isCompact ? spacing.md : spacing.lg }]}>
      <Text style={styles.panelTitle}>Thêm thực phẩm</Text>
      <Text style={styles.panelSubtitle}>Chụp sản phẩm hoặc quét mã để nhận diện tên, rồi nhập số lượng và đơn vị.</Text>
      {!familyId || !accessToken ? (
        <Text style={styles.helper}>Đăng nhập và tạo hoặc tham gia gia đình để thêm thực phẩm vào kho.</Text>
      ) : (
        <>
          <View style={styles.modeRow}>
            {([
              ["photo", "Chụp"], ["barcode", "Quét mã vạch"], ["receipt", "Hóa đơn"], ["voice", "Giọng nói"],
            ] as Array<[Mode, string]>).map(([value, label]) => (
              <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: mode === value }} key={value} onPress={() => { chooseMode(value); if (value === "photo") void scanReceipt("camera", true); if (value === "barcode") void startBarcodeCamera(); }} style={[styles.modeButton, mode === value && styles.modeButtonActive]}>
                <View style={styles.modeContent}>
                  {value === "photo" ? <AppIcon icon={Camera} size="sm" color={mode === value ? colors.surface : colors.muted} />
                    : value === "barcode" ? <AppIcon icon={ScanBarcode} size="sm" color={mode === value ? colors.surface : colors.muted} />
                      : value === "receipt" ? <AppIcon icon={Receipt} size="sm" color={mode === value ? colors.surface : colors.muted} />
                        : <AppIcon icon={Mic} size="sm" color={mode === value ? colors.surface : colors.muted} />}
                  {value !== "photo" && <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{label}</Text>}
                </View>
              </Pressable>
            ))}
          </View>

          {mode === "barcode" && (
            <View style={styles.section}>
              <Text style={styles.label}>Quét bằng camera hoặc nhập mã vạch</Text>
              <View style={styles.barcodeRow}>
                <TextInput accessibilityLabel="Mã vạch gồm 8 đến 14 chữ số" value={barcode} onChangeText={setBarcode} placeholder="8–14 chữ số" keyboardType="number-pad" style={[styles.input, styles.barcodeInput]} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void lookupBarcode(barcode)} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={Search} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Tra cứu</Text></View></Pressable>
              </View>
              {cameraActive ? (
                <View style={styles.cameraFrame}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14"] }}
                    onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
                    onMountError={() => {
                      setCameraActive(false);
                      setNote("Không khởi chạy được máy quét. Bạn có thể nhập mã vạch bằng tay bên dưới.");
                    }}
                  />
                  <Pressable accessibilityRole="button" onPress={() => setCameraActive(false)} style={styles.cameraClose}><View style={styles.actionContent}><AppIcon icon={X} size="sm" color={colors.surface} /><Text style={styles.cameraCloseText}>Đóng camera</Text></View></Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => void startBarcodeCamera()} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={ScanBarcode} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>{cameraPermission?.granted ? "Mở máy quét" : "Cấp quyền và quét mã"}</Text></View></Pressable>
              )}
              {barcodeResult && <Text style={styles.helper}>{barcodeResult}</Text>}
            </View>
          )}

          {mode === "receipt" && (
            <View style={styles.section}>
              <Text style={styles.label}>Đọc hóa đơn (ảnh JPEG, PNG hoặc WebP, tối đa 5 MB)</Text>
              <View style={styles.actionsRow}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scanReceipt("camera")} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={Camera} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Chụp hóa đơn</Text></View></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scanReceipt("library")} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={FileImage} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Chọn ảnh</Text></View></Pressable>
              </View>
              {!!receiptText && <Text numberOfLines={4} style={styles.ocrText}>Văn bản OCR: {receiptText}</Text>}
              {receiptDrafts.map((draft) => (
                <View key={draft.id} style={styles.receiptCard}>
                  <Text style={styles.sourceText}>Nhận diện: {draft.sourceText}</Text>
                  <Text style={styles.recognizedName}>{draft.name}</Text>
                  <View style={styles.barcodeRow}>
                    <TextInput accessibilityLabel={`Số lượng cho ${draft.name || "món nhận diện"}`} value={draft.quantity} onChangeText={(value) => updateReceiptDraft(draft.id, "quantity", value)} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                    <UnitButtons value={draft.unit} onChange={(value) => updateReceiptDraft(draft.id, "unit", value)} />
                  </View>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveReceiptDraft(draft)} style={styles.saveButton}><Text style={styles.saveButtonText}>Xác nhận và thêm vào kho</Text></Pressable>
                </View>
              ))}
            </View>
          )}

          {mode === "voice" && (
            <View style={styles.section}>
              <Text style={styles.label}>Nhận dạng tiếng Việt trên thiết bị</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: recognizing }} disabled={busy} onPress={() => void startVoice()} style={[styles.voiceButton, recognizing && styles.voiceButtonActive]}>
                <View style={styles.actionContent}><AppIcon icon={Mic} size="sm" color={colors.surface} /><Text style={styles.saveButtonText}>{recognizing ? "Dừng nhận dạng" : "Bắt đầu nói"}</Text></View>
              </Pressable>
              {!!voiceText && <Text style={styles.helper}>Bản nháp nghe được: {voiceText}</Text>}
              <Text style={styles.helper}>Âm thanh không được lưu hoặc gửi tới dịch vụ bên ngoài. Thiết bị cần hỗ trợ model tiếng Việt ngoại tuyến.</Text>
            </View>
          )}

          {showMainDraft && (
            <View style={styles.section}>
              <Text style={styles.label}>Sản phẩm nhận diện</Text>
              <Text style={styles.recognizedName}>{name}</Text>
              <Text style={styles.label}>Số lượng</Text>
              <TextInput accessibilityLabel="Số lượng thực phẩm" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
              <UnitButtons value={unit} onChange={setUnit} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveMainDraft()} style={[styles.saveButton, busy && styles.disabledButton]}>
                {busy ? <ActivityIndicator color={colors.surface} /> : <View style={styles.actionContent}><AppIcon icon={Check} size="sm" color={colors.surface} /><Text style={styles.saveButtonText}>Xác nhận và thêm vào kho</Text></View>}
              </Pressable>
            </View>
          )}
        </>
      )}
      {note && <Text accessibilityRole="alert" style={styles.notice}>{note}</Text>}
      {busy && <View style={styles.busyRow}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Đang xử lý…</Text></View>}
    </View>
  );
}

function UnitButtons({ value, onChange }: { value: InventoryUnit; onChange: (unit: InventoryUnit) => void }): React.JSX.Element {
  return (
    <RadioDropdown<InventoryUnit>
      label="Đơn vị"
      value={value}
      options={units.map((unit) => ({ value: unit, label: unitLabels[unit] }))}
      onChange={onChange}
      searchable
      searchPlaceholder="Tìm đơn vị (kg, hộp...)"
    />
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginTop: spacing.lg, maxWidth: 860, width: "100%" },
  panelTitle: { ...textStyles.subheading, color: colors.text },
  panelSubtitle: { color: colors.muted, ...typography.bodySmall, marginTop: spacing.xs },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingVertical: spacing.lg },
  modeButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 20, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modeContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  modeButtonActive: { backgroundColor: colors.primary },
  modeText: { color: colors.muted, ...typography.labelSmall },
  modeTextActive: { color: colors.surface },
  actionContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  section: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.md, paddingTop: spacing.lg },
  label: { color: colors.muted, ...typography.labelSmall, marginTop: spacing.xs },
  recognizedName: { backgroundColor: colors.primarySoft, borderRadius: 7, color: colors.text, ...typography.label, padding: spacing.md },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  barcodeRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  barcodeInput: { flex: 1, minWidth: 0 },
  quantityInput: { minWidth: 75, width: 90 },
  secondaryButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  secondaryButtonText: { color: colors.primary, ...typography.labelSmall },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cameraFrame: { backgroundColor: colors.text, borderRadius: 8, height: 220, overflow: "hidden", position: "relative" },
  cameraClose: { alignSelf: "flex-end", backgroundColor: colors.overlay, borderRadius: 6, justifyContent: "center", margin: spacing.md, minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cameraCloseText: { color: colors.surface, ...typography.labelSmall },
  helper: { color: colors.muted, ...typography.bodySmall },
  ocrText: { backgroundColor: colors.background, borderRadius: 6, color: colors.muted, ...typography.bodySmall, padding: spacing.md },
  receiptCard: { backgroundColor: colors.background, borderRadius: 8, gap: spacing.sm, marginTop: spacing.xs, padding: spacing.md },
  sourceText: { color: colors.muted, ...typography.caption },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: 44, marginTop: spacing.xs, paddingHorizontal: spacing.md },
  voiceButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  voiceButtonActive: { backgroundColor: colors.danger },
  saveButtonText: { color: colors.surface, ...typography.labelSmall, textAlign: "center" },
  disabledButton: { opacity: 0.65 },
  notice: { color: colors.danger, ...typography.bodySmall, marginTop: spacing.md },
  busyRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
