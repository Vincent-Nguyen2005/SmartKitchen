import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { Camera, Check, FileImage, Keyboard, Mic, Package, Receipt, ScanBarcode, Search, X } from "lucide-react-native";
import { inventoryApi, InventoryUnit, ProductCatalogResult, ReceiptMimeType } from "./inventoryApi";

type Mode = "manual" | "catalog" | "barcode" | "receipt" | "voice";
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
  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<InventoryUnit>("PIECE");
  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<ProductCatalogResult[]>([]);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<ProductCatalogResult | null>(null);
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
    if (nextMode !== "catalog") setSelectedCatalogProduct(null);
  };

  const searchCatalog = async () => {
    const query = catalogQuery.trim();
    if (query.length < 2) { setNote("Nhập ít nhất 2 ký tự để tìm trong Open Food Facts."); return; }
    if (!accessToken) { setNote("Đăng nhập để tìm sản phẩm."); return; }
    setCatalogLoading(true);
    setCatalogSearched(false);
    setCatalogResults([]);
    setNote(null);
    try {
      const result = await inventoryApi.searchCatalog(accessToken, query);
      setCatalogResults(result.results);
      setCatalogSearched(true);
      if (!result.results.length) setNote("Không tìm thấy sản phẩm khớp. Bạn có thể nhập tên thủ công.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Không tìm được sản phẩm lúc này.");
    } finally {
      setCatalogLoading(false);
    }
  };

  const chooseCatalogProduct = (product: ProductCatalogResult) => {
    setSelectedCatalogProduct(product);
    setName(product.name);
    setBarcode(product.barcode);
    setQuantity("1");
    setUnit("PIECE");
    setNote("Tên và mã vạch lấy từ Open Food Facts. Kiểm tra thông tin, số lượng và đơn vị trước khi thêm vào kho.");
  };

  const lookupBarcode = async (rawBarcode: string) => {
    const value = rawBarcode.trim();
    setBarcode(value);
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
        setBarcodeResult(`Đã tìm thấy trên ${result.source}${result.product.brand ? ` • ${result.product.brand}` : ""}. Kiểm tra và sửa trước khi lưu.`);
      } else {
        setName("");
        setBarcodeResult("Chưa có thông tin cho mã này. Nhập tên và đơn vị thủ công rồi xác nhận để lưu.");
      }
    } catch (error) {
      setBarcodeResult("Không tra cứu được lúc này. Bạn vẫn có thể nhập tên và lưu thủ công.");
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
    const itemBarcode = mode === "barcode" ? barcode : mode === "catalog" ? selectedCatalogProduct?.barcode : undefined;
    const saved = await saveItem(name, quantity, unit, itemBarcode);
    if (!saved) return;
    setName("");
    setQuantity("1");
    setBarcode("");
    setBarcodeResult(null);
    setSelectedCatalogProduct(null);
    setVoiceText("");
    setNote("Đã xác nhận và thêm thực phẩm vào kho.");
  };

  const scanReceipt = async (source: "camera" | "library") => {
    setNote(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote("Chưa được cấp quyền camera. Hãy chọn ảnh hóa đơn từ thư viện hoặc nhập tay."); return; }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { setNote("Chưa được cấp quyền ảnh. Hãy chụp hóa đơn hoặc nhập tay."); return; }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.65 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const imageBase64 = asset?.base64;
      if (!imageBase64) { setNote("Không đọc được dữ liệu ảnh. Hãy chọn ảnh khác hoặc nhập tay."); return; }
      if (imageBase64.length > 7_000_000) { setNote("Ảnh hóa đơn quá lớn. Hãy chọn ảnh nhỏ hơn 5 MB hoặc nhập tay."); return; }
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
      if (!mimeType) { setNote("Ảnh cần ở định dạng JPEG, PNG hoặc WebP. Hãy chọn ảnh khác hoặc nhập tay."); return; }
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
      setNote(recognized.items.length ? `Nhận diện được ${recognized.items.length} dòng. Hãy kiểm tra và sửa từng dòng trước khi lưu.` : "Chưa nhận diện được mặt hàng. Hãy chọn ảnh rõ hơn hoặc nhập thực phẩm bằng tay.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Không đọc được hóa đơn. Bạn có thể nhập mặt hàng bằng tay.");
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
        setNote("Thiết bị chưa hỗ trợ nhận dạng tiếng Việt trên máy. Nhập tên món bằng tay nhé.");
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) { setNote("Chưa được cấp quyền micro hoặc nhận dạng giọng nói. Bạn có thể nhập tay."); return; }
      clearSpeechSubscriptions();
      speechSubscriptions.current = [
        ExpoSpeechRecognitionModule.addListener("result", (event) => {
          setVoiceDraft(event.results[0]?.transcript ?? "");
        }),
        ExpoSpeechRecognitionModule.addListener("end", () => setRecognizing(false)),
        ExpoSpeechRecognitionModule.addListener("error", (event) => {
          setRecognizing(false);
          setNote(`Không nhận dạng được giọng nói (${event.error}). Bạn có thể sửa bản nháp hoặc nhập tay.`);
        }),
        ExpoSpeechRecognitionModule.addListener("nomatch", () => {
          setRecognizing(false);
          setNote("Chưa nghe rõ tên thực phẩm. Thử lại hoặc nhập tay nhé.");
        }),
      ];
      ExpoSpeechRecognitionModule.start({ lang: "vi-VN", interimResults: true, continuous: false, requiresOnDeviceRecognition: true });
      setRecognizing(true);
      setNote("Đang nhận dạng trên thiết bị. Nói tên thực phẩm, ví dụ: ‘2 kg gạo’.");
    } catch {
      setRecognizing(false);
      setNote("Chưa có module giọng nói trong bản ứng dụng này. Hãy cài development build mới hoặc nhập tay.");
    }
  };

  const showMainDraft = mode === "manual" || mode === "voice" ||
    (mode === "barcode" && (!!barcodeResult || /^\d{8,14}$/.test(barcode))) ||
    (mode === "catalog" && selectedCatalogProduct !== null);

  return (
    <View style={[styles.panel, { padding: isCompact ? 12 : 16 }]}>
      <Text style={styles.panelTitle}>Thêm thực phẩm</Text>
      <Text style={styles.panelSubtitle}>Chọn cách nhập. Mọi kết quả đều là bản nháp cho bạn kiểm tra trước khi lưu.</Text>
      {!familyId || !accessToken ? (
        <Text style={styles.helper}>Đăng nhập và tạo hoặc tham gia gia đình để thêm thực phẩm vào kho.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
            {([
              ["manual", "Nhập tay"], ["catalog", "Tìm sản phẩm"], ["barcode", "Mã vạch"], ["receipt", "Hóa đơn"], ["voice", "Giọng nói"],
            ] as Array<[Mode, string]>).map(([value, label]) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === value }} key={value} onPress={() => chooseMode(value)} style={[styles.modeButton, mode === value && styles.modeButtonActive]}>
                <View style={styles.modeContent}>
                  {value === "manual" ? <Keyboard color={mode === value ? "#FFFFFF" : "#4A5E51"} size={15} />
                    : value === "catalog" ? <Search color={mode === value ? "#FFFFFF" : "#4A5E51"} size={15} />
                    : value === "barcode" ? <ScanBarcode color={mode === value ? "#FFFFFF" : "#4A5E51"} size={15} />
                      : value === "receipt" ? <Receipt color={mode === value ? "#FFFFFF" : "#4A5E51"} size={15} />
                        : <Mic color={mode === value ? "#FFFFFF" : "#4A5E51"} size={15} />}
                  <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{label}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {mode === "catalog" && (
            <View style={styles.section}>
              <Text style={styles.label}>Tìm tên thực phẩm trong danh mục Open Food Facts</Text>
              <View style={styles.barcodeRow}>
                <TextInput
                  accessibilityLabel="Tên sản phẩm cần tìm bên ngoài"
                  onChangeText={(value) => { setCatalogQuery(value); setCatalogSearched(false); setCatalogResults([]); }}
                  onSubmitEditing={() => void searchCatalog()}
                  placeholder="Ví dụ: sữa tươi, mì gói..."
                  returnKeyType="search"
                  style={[styles.input, styles.barcodeInput]}
                  value={catalogQuery}
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Tìm sản phẩm bên ngoài" disabled={catalogLoading} onPress={() => void searchCatalog()} style={styles.secondaryButton}>
                  {catalogLoading ? <ActivityIndicator size="small" color="#215B43" /> : <View style={styles.actionContent}><Search color="#215B43" size={15} /><Text style={styles.secondaryButtonText}>Tìm</Text></View>}
                </Pressable>
              </View>
              <Text style={styles.helper}>Kết quả lấy trực tiếp từ Open Food Facts, không phải danh sách có sẵn. Dữ liệu do cộng đồng đóng góp nên hãy kiểm tra trước khi lưu.</Text>
              {selectedCatalogProduct && (
                <View style={styles.catalogSelected}>
                  {selectedCatalogProduct.imageUrl ? <Image source={{ uri: selectedCatalogProduct.imageUrl }} style={styles.catalogImage} /> : <View style={styles.catalogImageFallback}><Package color="#547364" size={20} /></View>}
                  <View style={styles.catalogProductInfo}>
                    <Text numberOfLines={2} style={styles.catalogProductName}>{selectedCatalogProduct.name}</Text>
                    <Text numberOfLines={1} style={styles.helper}>{selectedCatalogProduct.brand || "Open Food Facts"}{selectedCatalogProduct.packageQuantity ? ` · ${selectedCatalogProduct.packageQuantity}` : ""}</Text>
                    <Text style={styles.sourceText}>Mã vạch {selectedCatalogProduct.barcode}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Bỏ chọn sản phẩm" onPress={() => { setSelectedCatalogProduct(null); setName(""); setBarcode(""); }} style={styles.clearProductButton}><X color="#53655A" size={17} /></Pressable>
                </View>
              )}
              {!selectedCatalogProduct && catalogResults.map((product) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Chọn ${product.name}${product.brand ? `, ${product.brand}` : ""}`} key={product.barcode} onPress={() => chooseCatalogProduct(product)} style={styles.catalogResult}>
                  {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.catalogImage} /> : <View style={styles.catalogImageFallback}><Package color="#547364" size={20} /></View>}
                  <View style={styles.catalogProductInfo}>
                    <Text numberOfLines={2} style={styles.catalogProductName}>{product.name}</Text>
                    <Text numberOfLines={1} style={styles.helper}>{product.brand || "Open Food Facts"}{product.packageQuantity ? ` · ${product.packageQuantity}` : ""}</Text>
                    <Text style={styles.sourceText}>Mã vạch {product.barcode}</Text>
                  </View>
                </Pressable>
              ))}
              {!selectedCatalogProduct && catalogSearched && !catalogResults.length && <Text style={styles.emptyCatalog}>Chưa có kết quả. Hãy thử từ khóa khác hoặc nhập tên thủ công.</Text>}
            </View>
          )}

          {mode === "barcode" && (
            <View style={styles.section}>
              <Text style={styles.label}>Quét bằng camera hoặc nhập mã thủ công</Text>
              <View style={styles.barcodeRow}>
                <TextInput accessibilityLabel="Mã vạch gồm 8 đến 14 chữ số" value={barcode} onChangeText={setBarcode} placeholder="8–14 chữ số" keyboardType="number-pad" style={[styles.input, styles.barcodeInput]} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void lookupBarcode(barcode)} style={styles.secondaryButton}><View style={styles.actionContent}><Search color="#215B43" size={15} /><Text style={styles.secondaryButtonText}>Tra cứu</Text></View></Pressable>
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
                  <Pressable accessibilityRole="button" onPress={() => setCameraActive(false)} style={styles.cameraClose}><View style={styles.actionContent}><X color="#FFFFFF" size={14} /><Text style={styles.cameraCloseText}>Đóng camera</Text></View></Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => void startBarcodeCamera()} style={styles.secondaryButton}><View style={styles.actionContent}><ScanBarcode color="#215B43" size={15} /><Text style={styles.secondaryButtonText}>{cameraPermission?.granted ? "Mở máy quét" : "Cấp quyền và quét mã"}</Text></View></Pressable>
              )}
              {barcodeResult && <Text style={styles.helper}>{barcodeResult}</Text>}
            </View>
          )}

          {mode === "receipt" && (
            <View style={styles.section}>
              <Text style={styles.label}>Đọc hóa đơn (ảnh JPEG, PNG hoặc WebP, tối đa 5 MB)</Text>
              <View style={styles.actionsRow}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scanReceipt("camera")} style={styles.secondaryButton}><View style={styles.actionContent}><Camera color="#215B43" size={15} /><Text style={styles.secondaryButtonText}>Chụp hóa đơn</Text></View></Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scanReceipt("library")} style={styles.secondaryButton}><View style={styles.actionContent}><FileImage color="#215B43" size={15} /><Text style={styles.secondaryButtonText}>Chọn ảnh</Text></View></Pressable>
              </View>
              {!!receiptText && <Text numberOfLines={4} style={styles.ocrText}>Văn bản OCR: {receiptText}</Text>}
              {receiptDrafts.map((draft) => (
                <View key={draft.id} style={styles.receiptCard}>
                  <Text style={styles.sourceText}>Nhận diện: {draft.sourceText}</Text>
                  <Text style={styles.label}>Tên thực phẩm</Text>
                  <TextInput accessibilityLabel={`Tên thực phẩm nhận diện: ${draft.sourceText}`} value={draft.name} onChangeText={(value) => updateReceiptDraft(draft.id, "name", value)} style={styles.input} />
                  <View style={styles.barcodeRow}>
                    <TextInput accessibilityLabel={`Số lượng cho ${draft.name || "món nhận diện"}`} value={draft.quantity} onChangeText={(value) => updateReceiptDraft(draft.id, "quantity", value)} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                    <UnitButtons fill value={draft.unit} onChange={(value) => updateReceiptDraft(draft.id, "unit", value)} />
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
                <View style={styles.actionContent}><Mic color="#FFFFFF" size={16} /><Text style={styles.saveButtonText}>{recognizing ? "Dừng nhận dạng" : "Bắt đầu nói"}</Text></View>
              </Pressable>
              {!!voiceText && <Text style={styles.helper}>Bản nháp nghe được: {voiceText}</Text>}
              <Text style={styles.helper}>Âm thanh không được lưu hoặc gửi tới dịch vụ bên ngoài. Thiết bị cần hỗ trợ model tiếng Việt ngoại tuyến.</Text>
            </View>
          )}

          {showMainDraft && (
            <View style={styles.section}>
              <Text style={styles.label}>Xem lại tên</Text>
              <TextInput accessibilityLabel="Tên thực phẩm" value={name} onChangeText={setName} placeholder="Ví dụ: Gạo jasmine" style={styles.input} />
              <Text style={styles.label}>Số lượng</Text>
              <TextInput accessibilityLabel="Số lượng thực phẩm" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input} />
              <Text style={styles.label}>Đơn vị</Text>
              <UnitButtons value={unit} onChange={setUnit} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveMainDraft()} style={[styles.saveButton, busy && styles.disabledButton]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.actionContent}><Check color="#FFFFFF" size={16} /><Text style={styles.saveButtonText}>Xác nhận và thêm vào kho</Text></View>}
              </Pressable>
            </View>
          )}
        </>
      )}
      {note && <Text accessibilityRole="alert" style={styles.notice}>{note}</Text>}
      {busy && <View style={styles.busyRow}><ActivityIndicator color="#215B43" /><Text style={styles.helper}>Đang xử lý…</Text></View>}
    </View>
  );
}

function UnitButtons({ value, onChange, fill = false }: { value: InventoryUnit; onChange: (unit: InventoryUnit) => void; fill?: boolean }): React.JSX.Element {
  return (
    <ScrollView style={fill && styles.unitScrollerFill} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitRow}>
      {units.map((unit) => (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: value === unit }} accessibilityLabel={`Đơn vị ${unitLabels[unit]}`} key={unit} onPress={() => onChange(unit)} style={[styles.unitButton, value === unit && styles.unitButtonActive]}>
          <Text style={[styles.unitText, value === unit && styles.unitTextActive]}>{unitLabels[unit]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { alignSelf: "center", backgroundColor: "#FFFFFF", borderColor: "#DDE5DC", borderRadius: 12, borderWidth: 1, marginTop: 16, maxWidth: 860, width: "100%" },
  panelTitle: { color: "#17271F", fontSize: 18, fontWeight: "800" },
  panelSubtitle: { color: "#64736A", fontSize: 12, lineHeight: 18, marginTop: 4 },
  modeRow: { gap: 8, paddingVertical: 14 },
  modeButton: { backgroundColor: "#E5EBE3", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  modeContent: { alignItems: "center", flexDirection: "row", gap: 6 },
  modeButtonActive: { backgroundColor: "#215B43" },
  modeText: { color: "#4A5E51", fontSize: 12, fontWeight: "700" },
  modeTextActive: { color: "#FFFFFF" },
  actionContent: { alignItems: "center", flexDirection: "row", gap: 6 },
  catalogResult: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#E5EBE3", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 76, padding: 9 },
  catalogSelected: { alignItems: "center", backgroundColor: "#F2F7F0", borderColor: "#B8D0BD", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 76, padding: 9 },
  catalogImage: { backgroundColor: "#F6F8F4", borderRadius: 6, height: 56, width: 56 },
  catalogImageFallback: { alignItems: "center", backgroundColor: "#F6F8F4", borderRadius: 6, height: 56, justifyContent: "center", width: 56 },
  catalogProductInfo: { flex: 1, gap: 3, minWidth: 0 },
  catalogProductName: { color: "#26372D", fontSize: 13, fontWeight: "700" },
  clearProductButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  emptyCatalog: { backgroundColor: "#F6F8F4", borderRadius: 8, color: "#64736A", fontSize: 12, lineHeight: 18, padding: 12 },
  section: { borderTopColor: "#EDF1EB", borderTopWidth: 1, gap: 9, paddingTop: 13 },
  label: { color: "#34483B", fontSize: 12, fontWeight: "700", marginTop: 2 },
  input: { backgroundColor: "#FAFCF9", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, color: "#17271F", minHeight: 43, paddingHorizontal: 11, paddingVertical: 9 },
  barcodeRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  barcodeInput: { flex: 1, minWidth: 0 },
  quantityInput: { minWidth: 75, width: 90 },
  secondaryButton: { alignItems: "center", backgroundColor: "#E9F1EB", borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  secondaryButtonText: { color: "#215B43", fontSize: 12, fontWeight: "800" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cameraFrame: { backgroundColor: "#17271F", borderRadius: 8, height: 220, overflow: "hidden", position: "relative" },
  cameraClose: { alignSelf: "flex-end", backgroundColor: "#17271FDD", borderRadius: 6, margin: 10, paddingHorizontal: 10, paddingVertical: 7 },
  cameraCloseText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  helper: { color: "#64736A", fontSize: 12, lineHeight: 18 },
  ocrText: { backgroundColor: "#F6F8F4", borderRadius: 6, color: "#64736A", fontSize: 11, lineHeight: 16, padding: 9 },
  receiptCard: { backgroundColor: "#F6F8F4", borderRadius: 8, gap: 8, marginTop: 4, padding: 11 },
  sourceText: { color: "#78857C", fontSize: 10, lineHeight: 15 },
  unitRow: { gap: 6, paddingVertical: 2 },
  unitScrollerFill: { flex: 1, minWidth: 0 },
  unitButton: { backgroundColor: "#EEF2ED", borderRadius: 15, justifyContent: "center", minHeight: 40, paddingHorizontal: 10 },
  unitButtonActive: { backgroundColor: "#D4E7D8" },
  unitText: { color: "#53655A", fontSize: 11, fontWeight: "600" },
  unitTextActive: { color: "#215B43", fontWeight: "800" },
  saveButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 44, marginTop: 5, paddingHorizontal: 12 },
  voiceButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  voiceButtonActive: { backgroundColor: "#A75132" },
  saveButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", textAlign: "center" },
  disabledButton: { opacity: 0.65 },
  notice: { color: "#A75132", fontSize: 12, lineHeight: 18, marginTop: 10 },
  busyRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
});
