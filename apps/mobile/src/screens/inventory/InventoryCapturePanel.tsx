import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, FileImage, Mic, RotateCcw, ScanBarcode, Search, Settings, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, spacing, textStyles, touchTarget, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
import { DateField } from "../admin/DateField";
import { inventoryApi, type CatalogIngredient, InventoryUnit, ReceiptMimeType, type UploadPhoto } from "./inventoryApi";
import { CAMERA_PERMISSION_TEXT, takeItemPhoto, type PhotoPickResult } from "./inventoryPhoto";
import { dayFromToday, matchCatalog, unitFromCatalog } from "./catalogSuggest";

const isWeb = Platform.OS === "web";
const UPLOAD_FAILED_NOTE = "Đã lưu, nhưng chưa tải được ảnh. Thử lại";

export type InventoryCaptureMode = "photo" | "scan" | "voice";
type Mode = InventoryCaptureMode;
/**
 * onClose closes the surrounding sheet (camera cancelled before any photo). initialPhoto / initialVoiceText come
 * from the bottom bar, which opens the camera or starts listening before this panel is shown.
 */
type Props = {
  familyId: string | null;
  accessToken: string | null;
  onSaved: () => void;
  initialMode?: Mode;
  embedded?: boolean;
  autoStart?: boolean;
  onClose?: () => void;
  initialPhoto?: UploadPhoto | null;
  initialVoiceText?: string;
};
type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
type ReceiptDraft = { id: string; name: string; quantity: string; unit: InventoryUnit; sourceText: string };
type CaptureAsset = { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null };

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

export default function InventoryCapturePanel({ familyId, accessToken, onSaved, initialMode = "photo", embedded = false, autoStart = false, onClose, initialPhoto = null, initialVoiceText }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<InventoryUnit>("PIECE");
  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  // Product photo: only a picture stored with the item. Nothing is recognized from it.
  const [photo, setPhoto] = useState<UploadPhoto | null>(initialPhoto);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [expiryDay, setExpiryDay] = useState("");
  const [group, setGroup] = useState("");
  const [catalog, setCatalog] = useState<CatalogIngredient[] | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ itemId: string; itemName: string; photo: UploadPhoto } | null>(null);
  const photoUri = photo?.uri ?? null;
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const galleryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState("");
  const [receiptDrafts, setReceiptDrafts] = useState<ReceiptDraft[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const speechModule = useRef<SpeechModule | null>(null);
  const speechSubscriptions = useRef<Array<{ remove: () => void }>>([]);
  const lastScannedBarcode = useRef("");
  const autoStarted = useRef(false);

  const clearSpeechSubscriptions = () => {
    speechSubscriptions.current.forEach((subscription) => subscription.remove());
    speechSubscriptions.current = [];
  };

  useEffect(() => () => {
    clearSpeechSubscriptions();
    if (galleryTimer.current) clearTimeout(galleryTimer.current);
    try { speechModule.current?.abort(); } catch { /* Native speech module may be unavailable in Expo Go. */ }
  }, []);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setNote(null);
    setCameraActive(false);
    setPhoto(null);
    setCameraDenied(false);
    setSuggestionApplied(false);
    setName("");
    setBarcodeResult(null);
  };

  // Admin catalog suggestions: the server searches accent-insensitively (paged, max 50), so ask per typed name,
  // debounced. Suggestions are simply hidden if the request fails.
  useEffect(() => {
    const typed = name.trim();
    if (mode !== "photo" || !accessToken || !nameFocused || suggestionApplied || !typed) { setCatalog(null); return; }
    let active = true;
    const timer = setTimeout(() => {
      inventoryApi.ingredientCatalog(accessToken, { search: typed, limit: 20 })
        .then((result) => { if (active) setCatalog(Array.isArray(result.items) ? result.items : []); })
        .catch(() => { if (active) setCatalog([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [mode, accessToken, name, nameFocused, suggestionApplied]);

  const suggestions = mode === "photo" && nameFocused && !suggestionApplied && catalog ? matchCatalog(catalog, name) : [];

  const applySuggestion = (entry: CatalogIngredient) => {
    setName(entry.name);
    const catalogUnit = unitFromCatalog(entry.unit);
    if (catalogUnit) setUnit(catalogUnit);
    if (entry.shelfLifeDays !== null && entry.shelfLifeDays !== undefined) setExpiryDay(dayFromToday(entry.shelfLifeDays));
    if (entry.group?.trim()) setGroup(entry.group.trim());
    setSuggestionApplied(true);
  };

  /** Camera result: a photo opens the form; cancelling before any photo just closes, nothing is saved. */
  const handlePick = (result: PhotoPickResult) => {
    if (result.status === "picked") {
      setPhoto(result.photo);
      setCameraDenied(false);
    } else if (result.status === "denied") {
      setCameraDenied(true);
    } else if (result.status === "error") {
      setNote(result.message);
    } else if (!photo) {
      onClose?.();
    }
  };

  /** Camera denied: the only way forward is the system settings. */
  const closeDenied = () => {
    setCameraDenied(false);
    if (!photo) onClose?.();
  };

  const lookupBarcode = async (rawBarcode: string) => {
    const value = rawBarcode.trim();
    setBarcode(value);
    setName("");
    setReceiptDrafts([]);
    setReceiptText("");
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

  /**
   * "Chụp ảnh" / retake: the phone's camera right away (web: the camera file input, opened inside this tap, so
   * nothing may be awaited before takeItemPhoto). No photo library and no entry without a photo in this flow.
   */
  const startPhotoCamera = async () => {
    setNote(null);
    handlePick(await takeItemPhoto());
  };

  const handleBarcodeScanned = (value: string) => {
    if (!value || lastScannedBarcode.current === value) return;
    lastScannedBarcode.current = value;
    setCameraActive(false);
    setBarcode(value);
    void lookupBarcode(value);
  };

  const saveItem = async (
    itemName: string,
    itemQuantity: string,
    itemUnit: InventoryUnit,
    extras: { barcode?: string; expiryDay?: string; group?: string } = {},
  ) => {
    const parsedQuantity = Number(itemQuantity.replace(",", "."));
    if (!familyId || !accessToken) { setNote("Đăng nhập và tạo hoặc tham gia gia đình để lưu vào kho."); return null; }
    if (!itemName.trim()) { setNote("Nhập tên thực phẩm trước khi lưu."); return null; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { setNote("Số lượng phải lớn hơn 0."); return null; }
    setBusy(true);
    setNote(null);
    setSuccess(null);
    try {
      const created = await inventoryApi.create(accessToken, {
        familyId,
        name: itemName.trim(),
        quantity: parsedQuantity,
        unit: itemUnit,
        storageLocation: "PANTRY",
        ...(extras.barcode ? { barcode: extras.barcode } : {}),
        ...(extras.expiryDay ? { expiryDate: `${extras.expiryDay}T00:00:00.000Z` } : {}),
        ...(extras.group?.trim() ? { categoryName: extras.group.trim().slice(0, 50) } : {}),
      });
      onSaved();
      return created;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Không lưu được thực phẩm. Thử lại nhé.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Uploads the photo of an item that is already saved; a failure keeps the item and offers a retry. */
  const uploadPhotoFor = async (itemId: string, itemName: string, itemPhoto: UploadPhoto) => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await inventoryApi.uploadPhoto(accessToken, itemId, itemPhoto);
      setPendingUpload(null);
      onSaved();
      setNote(null);
      setSuccess(`Đã thêm ${itemName} kèm ảnh vào kho.`);
    } catch {
      setPendingUpload({ itemId, itemName, photo: itemPhoto });
      setSuccess(null);
      setNote(UPLOAD_FAILED_NOTE);
    } finally {
      setBusy(false);
    }
  };

  const saveMainDraft = async () => {
    const itemBarcode = mode === "scan" ? barcode : undefined;
    const itemPhoto = mode === "photo" ? photo : null;
    if (mode === "photo" && !itemPhoto) { setNote("Hãy chụp ảnh sản phẩm trước khi lưu."); return; }
    const itemName = name.trim();
    const created = await saveItem(name, quantity, unit, { barcode: itemBarcode, expiryDay, group });
    if (!created) return;
    setName("");
    setQuantity("1");
    setBarcode("");
    setBarcodeResult(null);
    setVoiceText("");
    setPhoto(null);
    setExpiryDay("");
    setGroup("");
    setSuggestionApplied(false);
    if (itemPhoto) await uploadPhotoFor(created.id, itemName, itemPhoto);
    else setSuccess("Đã xác nhận và thêm thực phẩm vào kho.");
  };

  const processImage = async (asset: CaptureAsset) => {
    setNote(null);
    setName("");
    setBarcodeResult(null);
    setCameraActive(false);
    try {
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

  const scanReceipt = async (source: "camera" | "library") => {
    setNote(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote("Chưa được cấp quyền camera. Hãy cấp quyền rồi thử lại."); return; }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 });
      if (!result.canceled && result.assets[0]) await processImage(result.assets[0]);
    } catch {
      setNote("Không mở được camera hoặc thư viện ảnh. Hãy thử lại.");
    }
  };

  useEffect(() => {
    if (!autoStart || !embedded || !familyId || !accessToken || autoStarted.current) return;
    // Browsers only open the camera input from a tap; and a photo from the bottom bar needs no new shot.
    if (initialMode === "photo" && (isWeb || initialPhoto)) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      if (initialMode === "photo") void startPhotoCamera();
      if (initialMode === "scan") void startBarcodeCamera();
    }, 250);
    return () => clearTimeout(timer);
  }, [autoStart, embedded, familyId, accessToken, initialMode]);

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

  // Transcript heard by the bottom-bar voice overlay: same draft as speaking inside this panel.
  useEffect(() => {
    if (initialVoiceText) setVoiceDraft(initialVoiceText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const showMainDraft = (mode === "photo" && !!photoUri) || (!!name.trim() && (mode === "scan" || mode === "voice"));

  return (
    <View style={[styles.panel, embedded && styles.embeddedPanel, { padding: isCompact ? spacing.md : spacing.lg }]}>
      {!embedded && <Text style={styles.panelTitle}>Thêm thực phẩm</Text>}
      {!embedded && <Text style={styles.panelSubtitle}>Chụp sản phẩm hoặc quét mã để nhận diện tên, rồi nhập số lượng và đơn vị.</Text>}
      {!familyId || !accessToken ? (
        <Text style={styles.helper}>Đăng nhập và tạo hoặc tham gia gia đình để thêm thực phẩm vào kho.</Text>
      ) : (
        <>
          {!embedded && <View style={styles.modeRow}>
            {([
              ["photo", "Chụp ảnh"], ["scan", "Mã vạch / hóa đơn"], ["voice", "Giọng nói"],
            ] as Array<[Mode, string]>).map(([value, label]) => (
              <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: mode === value }} key={value} onPress={() => { chooseMode(value); if (value === "photo") void startPhotoCamera(); if (value === "scan") void startBarcodeCamera(); }} style={[styles.modeButton, mode === value && styles.modeButtonActive]}>
                <View style={styles.modeContent}>
                  {value === "photo" ? <AppIcon icon={Camera} size="sm" color={mode === value ? colors.surface : colors.muted} />
                    : value === "scan" ? <AppIcon icon={ScanBarcode} size="sm" color={mode === value ? colors.surface : colors.muted} />
                      : <AppIcon icon={Mic} size="sm" color={mode === value ? colors.surface : colors.muted} />}
                  <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{label}</Text>
                </View>
              </Pressable>
            ))}
          </View>}

          {mode === "photo" && (
            <View style={styles.section}>
              {!photoUri && !cameraDenied && (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void startPhotoCamera()} style={styles.saveButton}>
                  <View style={styles.actionContent}><AppIcon icon={Camera} size="sm" color={colors.surface} /><Text style={styles.saveButtonText}>Chụp ảnh</Text></View>
                </Pressable>
              )}
              {cameraDenied && (
                <View accessibilityRole="alert" style={styles.permissionCard}>
                  <Text style={styles.permissionTitle}>{CAMERA_PERMISSION_TEXT}</Text>
                  <View style={styles.actionsRow}>
                    <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.saveButton}>
                      <View style={styles.actionContent}><AppIcon icon={Settings} size="sm" color={colors.surface} /><Text style={styles.saveButtonText}>Mở cài đặt</Text></View>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={closeDenied} style={styles.secondaryButton}>
                      <View style={styles.actionContent}><AppIcon icon={X} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Đóng</Text></View>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}

          {mode === "scan" && (
            <View style={styles.section}>
              <Text style={styles.label}>Quét bằng camera hoặc nhập mã vạch</Text>
              <View style={styles.barcodeRow}>
                <TextInput accessibilityLabel="Mã vạch gồm 8 đến 14 chữ số" value={barcode} onChangeText={setBarcode} placeholder="8–14 chữ số" keyboardType="number-pad" style={[styles.input, styles.barcodeInput]} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void lookupBarcode(barcode)} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={Search} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Tra cứu</Text></View></Pressable>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void startBarcodeCamera()} style={styles.secondaryButton}><View style={styles.actionContent}><AppIcon icon={ScanBarcode} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>{cameraPermission?.granted ? "Mở máy quét" : "Cấp quyền và quét mã"}</Text></View></Pressable>
              {cameraActive && <Modal visible animationType="fade" onRequestClose={() => setCameraActive(false)}>
                <View style={styles.scannerScreen}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14"] }}
                    onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
                    onMountError={() => {
                      setCameraActive(false);
                      setNote("Không khởi chạy được máy quét. Bạn có thể nhập mã vạch bằng tay.");
                    }}
                  />
                  <SafeAreaView style={styles.scannerOverlay}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Đóng máy quét" onPress={() => setCameraActive(false)} style={styles.scannerClose}>
                      <AppIcon icon={X} size="md" color={colors.surface} />
                    </Pressable>
                    <View style={styles.scannerCenter}>
                      <View pointerEvents="none" style={styles.scannerTarget} />
                      <Text style={styles.scannerHint}>Đưa mã vạch sản phẩm vào khung</Text>
                    </View>
                  </SafeAreaView>
                </View>
              </Modal>}
              {barcodeResult && <Text style={styles.helper}>{barcodeResult}</Text>}
              <View style={styles.scanDivider} />
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
              {mode === "photo" && photoUri && (
                <Pressable accessibilityRole="button" accessibilityLabel="Ảnh sản phẩm. Chạm để chụp lại" disabled={busy} onPress={() => void startPhotoCamera()}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
                  <Text style={styles.retakeHint}>Chạm ảnh để chụp lại</Text>
                </Pressable>
              )}
              <Text style={styles.label}>{mode === "photo" ? "Tên *" : "Sản phẩm nhận diện"}</Text>
              {mode === "photo"
                ? <TextInput
                    accessibilityLabel="Tên thực phẩm, bắt buộc"
                    value={name}
                    onChangeText={(value) => { setName(value); setSuggestionApplied(false); }}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setTimeout(() => setNameFocused(false), 200)}
                    placeholder="Ví dụ: rau muống, thịt ba chỉ"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                : <Text style={styles.recognizedName}>{name}</Text>}
              {suggestions.length > 0 && (
                <View accessibilityLabel="Gợi ý từ danh mục nguyên liệu" style={styles.suggestionList}>
                  {suggestions.map((entry) => (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Chọn ${entry.name}`} key={entry.id} onPress={() => applySuggestion(entry)} style={styles.suggestionRow}>
                      <Text style={styles.suggestionName}>{entry.name}</Text>
                      {!!entry.group && <Text style={styles.suggestionMeta}>{entry.group}{entry.shelfLifeDays !== null ? ` · ${entry.shelfLifeDays} ngày` : ""}</Text>}
                    </Pressable>
                  ))}
                </View>
              )}
              {suggestionApplied && <Text style={styles.suggestionCaption}>Gợi ý theo danh mục, sửa nếu cần</Text>}
              {mode === "photo" ? (
                <>
                  <Text style={styles.label}>Khối lượng *</Text>
                  <View style={styles.barcodeRow}>
                    <TextInput accessibilityLabel="Khối lượng, bắt buộc" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                    <View style={styles.unitPicker}><UnitButtons value={unit} onChange={setUnit} /></View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Số lượng *</Text>
                  <TextInput accessibilityLabel="Số lượng thực phẩm, bắt buộc" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
                  <UnitButtons value={unit} onChange={setUnit} />
                </>
              )}
              {/* DateField shows dd/mm/yyyy and reports YYYY-MM-DD. */}
              <DateField
                label={mode === "photo" ? "Hạn sử dụng" : "Hạn dùng"}
                value={expiryDay}
                onChange={setExpiryDay}
                minDate={dayFromToday(0)}
                suggestedDate={dayFromToday(3)}
                emptyHint="Không bắt buộc. Chọn ngày để được nhắc trước khi hết hạn."
              />
              {mode !== "photo" && (
                <>
                  <Text style={styles.label}>Nhóm</Text>
                  <TextInput accessibilityLabel="Nhóm thực phẩm, không bắt buộc" value={group} onChangeText={setGroup} placeholder="Rau củ, thịt, hải sản..." placeholderTextColor={colors.muted} maxLength={50} style={styles.input} />
                </>
              )}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveMainDraft()} style={[styles.saveButton, busy && styles.disabledButton]}>
                {busy ? <ActivityIndicator color={colors.surface} /> : <View style={styles.actionContent}><AppIcon icon={Check} size="sm" color={colors.surface} /><Text style={styles.saveButtonText}>{mode === "photo" ? "Lưu" : "Xác nhận và thêm vào kho"}</Text></View>}
              </Pressable>
            </View>
          )}
        </>
      )}
      {note && <Text accessibilityRole="alert" style={styles.notice}>{note}</Text>}
      {pendingUpload && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Thử tải lại ảnh cho ${pendingUpload.itemName}`} disabled={busy} onPress={() => void uploadPhotoFor(pendingUpload.itemId, pendingUpload.itemName, pendingUpload.photo)} style={[styles.secondaryButton, styles.retryButton, busy && styles.disabledButton]}>
          <View style={styles.actionContent}><AppIcon icon={RotateCcw} size="sm" color={colors.primary} /><Text style={styles.secondaryButtonText}>Thử lại</Text></View>
        </Pressable>
      )}
      {success && !note && <Text accessibilityLiveRegion="polite" style={styles.successText}>{success}</Text>}
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
  embeddedPanel: { borderWidth: 0, marginTop: 0 },
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
  scanDivider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.xs },
  label: { color: colors.muted, ...typography.labelSmall, marginTop: spacing.xs },
  recognizedName: { backgroundColor: colors.primarySoft, borderRadius: 7, color: colors.text, ...typography.label, padding: spacing.md },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  barcodeRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  barcodeInput: { flex: 1, minWidth: 0 },
  quantityInput: { minWidth: 75, width: 90 },
  secondaryButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  secondaryButtonText: { color: colors.primary, ...typography.labelSmall },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  scannerScreen: { backgroundColor: colors.text, flex: 1 },
  scannerOverlay: { flex: 1, justifyContent: "space-between" },
  scannerClose: { alignItems: "center", alignSelf: "flex-end", backgroundColor: colors.overlay, borderRadius: 24, height: 48, justifyContent: "center", margin: spacing.lg, width: 48 },
  scannerCenter: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  scannerTarget: { borderColor: colors.surface, borderRadius: 16, borderWidth: 2, height: 200, maxWidth: 340, width: "100%" },
  scannerHint: { backgroundColor: colors.overlay, borderRadius: 8, color: colors.surface, marginTop: spacing.lg, padding: spacing.md, textAlign: "center", ...typography.labelSmall },
  photoOverlay: { flex: 1, justifyContent: "space-between" },
  photoTarget: { borderColor: colors.surface, borderRadius: 24, borderWidth: 2, height: 260, maxWidth: 340, width: "100%" },
  photoControls: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  galleryButton: { alignItems: "center", gap: spacing.xs, justifyContent: "center", minHeight: 72, width: 90 },
  photoControlLabel: { color: colors.surface, ...typography.labelSmall },
  shutterButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 44, borderWidth: 5, height: 82, justifyContent: "center", width: 82 },
  photoPreview: { alignSelf: "center", backgroundColor: colors.background, borderRadius: 8, height: 170, width: "100%" },
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
  retakeHint: { ...textStyles.caption, marginTop: spacing.xs, textAlign: "center" },
  unitPicker: { flex: 1, minWidth: 0 },
  permissionCard: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: 8, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  permissionTitle: { ...textStyles.label },
  suggestionList: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 7, borderWidth: 1, overflow: "hidden" },
  suggestionRow: { borderBottomColor: colors.border, borderBottomWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionName: { ...textStyles.body },
  suggestionMeta: { ...textStyles.caption },
  suggestionCaption: { ...textStyles.caption, color: colors.primary },
  retryButton: { alignSelf: "flex-start", marginTop: spacing.sm },
  successText: { ...textStyles.bodySmall, color: colors.success, marginTop: spacing.md },
});
