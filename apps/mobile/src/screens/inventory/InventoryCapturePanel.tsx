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
import AuthImage from "../../components/AuthImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, FileImage, RotateCcw, ScanBarcode, Search, Settings, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, spacing, textStyles, touchTarget, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
import { DateField } from "../admin/DateField";
import { inventoryApi, type CatalogIngredient, type ItemMatch, InventoryUnit, ReceiptMimeType, type UploadPhoto } from "./inventoryApi";
import { marketCatalog } from "./marketCatalog";
import { createServerSearch, type ServerSearch } from "../../services/localSearch";
import { CAMERA_PERMISSION_TEXT, takeItemPhoto, type PhotoPickResult } from "./inventoryPhoto";
import { catalogProductNamed, catalogUnitForName, dayFromToday, matchCatalog, unitFromCatalog } from "./catalogSuggest";
import { choiceFor, choiceLabel, kitchenAmount, storedUnitLabel, UNIT_CHOICES } from "./unitChoices";
import { useConfirm } from "../../components/ConfirmDialog";

const isWeb = Platform.OS === "web";
const UPLOAD_FAILED_NOTE = "Đã lưu, nhưng chưa tải được ảnh. Thử lại";

export type InventoryCaptureMode = "photo" | "scan";
type Mode = InventoryCaptureMode;
/**
 * onClose closes the surrounding sheet (camera cancelled before any photo). initialPhoto comes from the bottom bar,
 * which opens the camera before this panel is shown.
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
};
type ReceiptDraft = { id: string; name: string; quantity: string; unit: InventoryUnit; sourceText: string };
type CaptureAsset = { uri: string; base64?: string | null; mimeType?: string | null; fileName?: string | null };


export default function InventoryCapturePanel({ familyId, accessToken, onSaved, initialMode = "photo", embedded = false, autoStart = false, onClose, initialPhoto = null }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<InventoryUnit>("PIECE");
  // The specific piece word picked with the unit ("quả", "trái"...); stored only for PIECE (unitChoices.ts).
  const [pieceWord, setPieceWord] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  // Product photo: stored with the item after saving; also sent once to the server to suggest the name.
  const [photo, setPhoto] = useState<UploadPhoto | null>(initialPhoto);
  // Names suggested from the photo (catalog products, best first); "idle" until a photo is taken.
  // autofilled: the top name was put in Tên (server said it is sure); otherwise all suggestions are only offered.
  const [photoGuess, setPhotoGuess] = useState<{ state: "idle" | "loading" | "done" | "none"; options: Array<{ name: string; catalogId: string; imageUrl?: string | null }>; autofilled?: boolean }>({ state: "idle", options: [] });
  const typedSincePhoto = useRef(false);
  // Catalog product the current name matches (server rule): its image replaces the captured photo in the preview,
  // and the captured photo is then not uploaded (Kho shows the catalog image).
  const [catalogMatch, setCatalogMatch] = useState<{ productId: string; name: string; imageUrl: string | null } | null>(null);
  const { choose, dialog } = useConfirm();
  const [cameraDenied, setCameraDenied] = useState(false);
  const [expiryDay, setExpiryDay] = useState("");
  const [group, setGroup] = useState("");
  // The shared market catalog (loaded once per session): name suggestions and the unit default are matched here.
  const [catalog, setCatalog] = useState<CatalogIngredient[] | null>(() => (accessToken ? marketCatalog(accessToken).peek() : null));
  // The user picked a unit by hand: a catalog match no longer changes it.
  const unitTouched = useRef(false);
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
  const lastScannedBarcode = useRef("");
  const autoStarted = useRef(false);

  useEffect(() => () => {
    if (galleryTimer.current) clearTimeout(galleryTimer.current);
  }, []);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setNote(null);
    setCameraActive(false);
    setPhoto(null);
    setCameraDenied(false);
    setSuggestionApplied(false);
    setName("");
    unitTouched.current = false;
    setPieceWord(null);
    setBarcodeResult(null);
    setPhotoGuess({ state: "idle", options: [] });
  };

  // Catalog name suggestions and the unit default come from the shared catalog, matched on the device
  // (accent-insensitive): typing sends no catalog request. Suggestions are simply hidden if it cannot load.
  useEffect(() => {
    if (mode !== "photo" || !accessToken || catalog) return;
    let active = true;
    marketCatalog(accessToken).get().then((items) => { if (active) setCatalog(items); }).catch(() => undefined);
    return () => { active = false; };
  }, [mode, accessToken, catalog]);

  const suggestions = mode === "photo" && nameFocused && !suggestionApplied && catalog && name.trim() ? matchCatalog(catalog, name) : [];

  // A name that is exactly a catalog product takes that product's sale unit (kg, gói, quả...) unless the user chose
  // a unit, so "Đã có trong kho" finds the existing row instead of a second row in another unit being created.
  useEffect(() => {
    if (mode !== "photo" || unitTouched.current || !catalog) return;
    const catalogUnit = catalogUnitForName(catalog, name);
    if (catalogUnit) {
      setUnit(catalogUnit);
      setPieceWord(catalogProductNamed(catalog, name)?.unitLabel ?? null);
    }
  }, [mode, catalog, name]);

  // Catalog image for the typed name (server rule): debounced 400 ms, at least 2 characters, a repeat of the same
  // name + unit is skipped, and an older request is aborted (its late answer is ignored).
  const matchSearch = useRef<ServerSearch | null>(null);
  const matchContext = useRef({ accessToken, familyId });
  matchContext.current = { accessToken, familyId };
  if (!matchSearch.current) {
    matchSearch.current = createServerSearch<ItemMatch | null>({
      run: (query, signal) => {
        const { accessToken: token, familyId: family } = matchContext.current;
        const [typed, typedUnit] = query.split("\u0000");
        if (!token || !family) return Promise.resolve(null);
        return inventoryApi.match(token, family, typed, typedUnit as InventoryUnit, signal);
      },
      onResult: (result) => setCatalogMatch(result?.product ? { productId: result.product.id, name: result.product.name, imageUrl: result.product.imageUrl } : null),
      onError: () => setCatalogMatch(null),
      // The unit is part of the key; the minimum length applies to the name.
      normalize: (text) => {
        const [typed, typedUnit = ""] = text.split("\u0000");
        const clean = typed.trim().replace(/\s+/g, " ");
        return clean.length < 2 ? clean : `${clean}\u0000${typedUnit}`;
      },
      minLength: 2,
    });
  }
  useEffect(() => () => matchSearch.current?.cancel(), []);
  useEffect(() => {
    if (mode !== "photo" || !accessToken || !familyId) { matchSearch.current?.cancel(); setCatalogMatch(null); return; }
    matchSearch.current?.input(`${name}\u0000${unit}`);
  }, [mode, accessToken, familyId, name, unit]);

  const applySuggestion = (entry: CatalogIngredient) => {
    setName(entry.name);
    const catalogUnit = unitFromCatalog(entry.unit);
    if (catalogUnit) { setUnit(catalogUnit); setPieceWord(entry.unitLabel ?? null); }
    if (entry.shelfLifeDays !== null && entry.shelfLifeDays !== undefined) setExpiryDay(dayFromToday(entry.shelfLifeDays));
    if (entry.group?.trim()) setGroup(entry.group.trim());
    setSuggestionApplied(true);
  };

  /** Picks a suggested catalog name: fetches that product (unit, shelf life, group) and fills the form like a typed pick. */
  const pickSuggestedName = async (option: { name: string; catalogId: string; imageUrl?: string | null }) => {
    setName(option.name);
    setSuggestionApplied(true);
    // Instant preview with the product's catalog image (the name check confirms it).
    setCatalogMatch({ productId: option.catalogId, name: option.name, imageUrl: option.imageUrl ?? null });
    if (!accessToken) return;
    const items = catalog ?? await marketCatalog(accessToken).get().catch(() => null);
    const entry = items?.find((row) => row.id === option.catalogId) ?? (items ? catalogProductNamed(items, option.name) : null);
    if (entry) applySuggestion(entry);
  };

  // A new photo: ask the server for name suggestions. Tên is prefilled only if the user has not typed meanwhile;
  // errors or "unsure" just leave Tên empty (a muted hint, no popup). Saving never waits for this.
  useEffect(() => {
    if (mode !== "photo" || !photo || !accessToken) return;
    let active = true;
    typedSincePhoto.current = false;
    setPhotoGuess({ state: "loading", options: [] });
    inventoryApi.suggestFromPhoto(accessToken, photo)
      .then((result) => {
        if (!active) return;
        const options = result.suggestions.map(({ name: suggested, catalogId, imageUrl }) => ({ name: suggested, catalogId, imageUrl }));
        // Tên is filled only when recognition is sure (server `autofill`); else the user taps a suggestion or types.
        const autofilled = result.autofill === true && options.length > 0 && !typedSincePhoto.current;
        setPhotoGuess({ state: options.length > 0 ? "done" : "none", options, autofilled });
        if (autofilled) void pickSuggestedName(options[0]);
      })
      .catch(() => { if (active) setPhotoGuess({ state: "none", options: [] }); });
    return () => { active = false; };
  }, [photo, mode, accessToken]);

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
    unitTouched.current = false;
    setPieceWord(null);
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
        unitTouched.current = false;
        setPieceWord(null);
    setPieceWord(null);
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
    extras: { barcode?: string; expiryDay?: string; group?: string; unitLabel?: string | null } = {},
  ) => {
    const parsedQuantity = Number(itemQuantity.replace(",", "."));
    if (!familyId || !accessToken) { setNote("Đăng nhập và tạo hoặc tham gia gia đình để lưu vào kho."); return null; }
    if (!itemName.trim()) { setNote("Nhập tên thực phẩm trước khi lưu."); return null; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { setNote("Số lượng phải lớn hơn 0."); return null; }
    setBusy(true);
    setNote(null);
    setSuccess(null);
    try {
      const cleanName = itemName.trim();
      const expiryDate = extras.expiryDay ? `${extras.expiryDay}T00:00:00.000Z` : undefined;
      // Same product already in Kho with the same unit: ask (never merge silently). A failed check just creates.
      const found = await inventoryApi.match(accessToken, familyId, cleanName, itemUnit).catch(() => null);
      if (found?.existing) {
        const existing = found.existing;
        setBusy(false);
        const choice = await choose({
          title: "Đã có trong kho",
          // A used-up row is restocked as a new batch on the server (new quantity and expiry), so no old amount is shown.
          message: existing.status === "CONSUMED"
            ? `Kho đã có ${existing.name} (đã dùng hết). Thêm lại vào?`
            : `Kho đã có ${existing.name} (${kitchenAmount(existing)}). Cộng thêm vào?`,
          confirmLabel: "Cộng thêm",
          cancelLabel: "Thêm riêng",
        });
        if (choice === "dismiss") return null;
        setBusy(true);
        if (choice === "confirm") {
          const merged = await inventoryApi.addQuantity(accessToken, familyId, existing.id, { quantity: parsedQuantity, unit: itemUnit, ...(expiryDate ? { expiryDate } : {}) });
          onSaved();
          return { ...merged, merged: true as const };
        }
      }
      const created = await inventoryApi.create(accessToken, {
        familyId,
        name: cleanName,
        quantity: parsedQuantity,
        unit: itemUnit,
        ...(extras.barcode ? { barcode: extras.barcode } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        ...(extras.group?.trim() ? { categoryName: extras.group.trim().slice(0, 50) } : {}),
        // PIECE word picked by the user; omitted = the server copies the linked catalog product's word.
        ...(extras.unitLabel ? { unitLabel: extras.unitLabel } : {}),
      });
      onSaved();
      return { ...created, merged: false as const };
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
    const created = await saveItem(name, quantity, unit, { barcode: itemBarcode, expiryDay, group, unitLabel: storedUnitLabel(unit, pieceWord) });
    if (!created) return;
    setName("");
    unitTouched.current = false;
    setPieceWord(null);
    setQuantity("1");
    setBarcode("");
    setBarcodeResult(null);
    setPhoto(null);
    setExpiryDay("");
    setGroup("");
    setSuggestionApplied(false);
    setPhotoGuess({ state: "idle", options: [] });
    setCatalogMatch(null);
    // Catalog product (productId set by the server): Kho shows the catalog image, the captured photo is not stored.
    // Added to an existing row: that row keeps its own image. Otherwise the captured photo is uploaded as before.
    if (created.merged) setSuccess(`Đã cộng thêm vào ${created.name} trong kho.`);
    else if (created.productId) setSuccess(`Đã thêm ${created.name} vào kho (dùng ảnh sản phẩm trong danh mục).`);
    else if (itemPhoto) await uploadPhotoFor(created.id, itemName, itemPhoto);
    else setSuccess("Đã xác nhận và thêm thực phẩm vào kho.");
  };

  const processImage = async (asset: CaptureAsset) => {
    setNote(null);
    setName("");
    unitTouched.current = false;
    setPieceWord(null);
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

  const showMainDraft = (mode === "photo" && !!photoUri) || (!!name.trim() && mode === "scan");

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
              ["photo", "Chụp ảnh"], ["scan", "Mã vạch / hóa đơn"],
            ] as Array<[Mode, string]>).map(([value, label]) => (
              <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: mode === value }} key={value} onPress={() => { chooseMode(value); if (value === "photo") void startPhotoCamera(); if (value === "scan") void startBarcodeCamera(); }} style={[styles.modeButton, mode === value && styles.modeButtonActive]}>
                <View style={styles.modeContent}>
                  {value === "photo" ? <AppIcon icon={Camera} size="sm" color={mode === value ? colors.surface : colors.muted} />
                    : <AppIcon icon={ScanBarcode} size="sm" color={mode === value ? colors.surface : colors.muted} />}
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

          {showMainDraft && (
            <View style={styles.section}>
              {mode === "photo" && photoUri && (
                <Pressable accessibilityRole="button" accessibilityLabel="Ảnh sản phẩm. Chạm để chụp lại" disabled={busy} onPress={() => void startPhotoCamera()}>
                  {/* AuthImage: a catalog image uploaded by an admin is a gateway path (needs the token); local photos show directly. */}
                  <AuthImage url={catalogMatch?.imageUrl ?? photoUri} accessToken={accessToken} accessibilityLabel={catalogMatch ? catalogMatch.name : "Ảnh vừa chụp"} style={styles.photoPreview} resizeMode="contain" fallback={<Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />} />
                  <Text style={styles.retakeHint}>{catalogMatch ? `Dùng ảnh ${catalogMatch.name} trong danh mục · chạm để chụp lại` : "Chạm ảnh để chụp lại"}</Text>
                </Pressable>
              )}
              <Text style={styles.label}>{mode === "photo" ? "Tên *" : "Sản phẩm nhận diện"}</Text>
              {mode === "photo"
                ? <TextInput
                    accessibilityLabel="Tên thực phẩm, bắt buộc"
                    value={name}
                    onChangeText={(value) => { typedSincePhoto.current = true; setName(value); setSuggestionApplied(false); }}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setTimeout(() => setNameFocused(false), 200)}
                    placeholder={photoGuess.state === "loading" && !name ? "Đang nhận diện..." : "Ví dụ: rau muống, thịt ba chỉ"}
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                : <Text style={styles.recognizedName}>{name}</Text>}
              {mode === "photo" && photoGuess.state === "done" && photoGuess.options.some((option) => option.name !== name) && (
                <View accessibilityLabel="Tên gợi ý từ ảnh" style={styles.guessChips}>
                  {photoGuess.options.filter((option) => option.name !== name).map((option) => (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Chọn tên ${option.name}`} key={option.catalogId} onPress={() => { typedSincePhoto.current = true; void pickSuggestedName(option); }} style={styles.guessChip}>
                      <Text style={styles.guessChipText}>{option.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {mode === "photo" && (photoGuess.state === "none" || (photoGuess.state === "done" && !photoGuess.autofilled)) && !name && <Text style={styles.guessHint}>Chọn gợi ý hoặc nhập tên nguyên liệu</Text>}
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
                    <View style={styles.unitPicker}><UnitButtons value={unit} word={pieceWord} onChange={(next, word) => { unitTouched.current = true; setUnit(next); setPieceWord(word); }} /></View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Số lượng *</Text>
                  <TextInput accessibilityLabel="Số lượng thực phẩm, bắt buộc" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
                  <UnitButtons value={unit} word={pieceWord} onChange={(next, word) => { setUnit(next); setPieceWord(word); }} />
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
      {dialog}
    </View>
  );
}

/** Unit picker with specific words (gói, cái, quả, trái, bìa, nải, hộp, chai, lon, g, kg, ml, lít). */
function UnitButtons({ value, word = null, onChange }: { value: InventoryUnit; word?: string | null; onChange: (unit: InventoryUnit, word: string | null) => void }): React.JSX.Element {
  return (
    <RadioDropdown<string>
      label="Đơn vị"
      value={choiceLabel(value, word)}
      options={UNIT_CHOICES.map((choice) => ({ value: choice.label, label: choice.label }))}
      onChange={(label) => { const choice = choiceFor(label); if (choice) onChange(choice.unit, choice.unitLabel); }}
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
  guessChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  guessChip: { backgroundColor: colors.primarySoft, borderRadius: 16, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  guessChipText: { ...textStyles.labelSmall, color: colors.primary },
  guessHint: { ...textStyles.caption, color: colors.muted },
  retryButton: { alignSelf: "flex-start", marginTop: spacing.sm },
  successText: { ...textStyles.bodySmall, color: colors.success, marginTop: spacing.md },
});
