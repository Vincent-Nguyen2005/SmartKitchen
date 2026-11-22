import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Archive, Camera, ImageMinus, Search, Trash2 } from "lucide-react-native";
import { AppIcon, colors, fontFamily, spacing, textStyles, touchTarget, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
import { EmptyState } from "../notifications/ui";
import { CardCaption, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid, type CardPillTone } from "../../components/ProductCard";
import { SEARCH_CONTENT_GAP, SearchBar } from "../../components/SearchBar";
import { FoodItem } from "./types";
import { useSession } from "../../services/session";
import { InventoryLocation, InventoryUnit, inventoryApi } from "./inventoryApi";
import { UNIT_LABELS } from "./catalogSuggest";
import { CAMERA_PERMISSION_TEXT, InventoryPhoto, takeItemPhoto, type PhotoPickResult } from "./inventoryPhoto";

const inventoryUnits: InventoryUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const inventoryLocations: InventoryLocation[] = ["FRIDGE", "FREEZER", "PANTRY", "COUNTER"];
const inventoryUnitLabels: Record<InventoryUnit, string> = UNIT_LABELS;
const inventoryLocationLabels: Record<InventoryLocation, string> = {
  FRIDGE: "Tủ lạnh", FREEZER: "Ngăn đông", PANTRY: "Tủ đựng thực phẩm", COUNTER: "Kệ bếp",
};
type InventoryDialogMode = "edit" | "consume";

function formatDateDdMmYyyy(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

const EXPIRING_SOON_DAYS = 3;
const pad2 = (value: number) => String(value).padStart(2, "0");

/** Card expiry line ("HSD 25/11") and corner pill for expired items or ones expiring within 3 days. */
function expiryInfo(item: FoodItem): { text: string; warning: boolean; pill: { label: string; tone: CardPillTone } | null } {
  const match = item.expiryDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(item.expiryDate) : null;
  if (!match) {
    return item.status === "EXPIRED"
      ? { text: "Đã hết hạn", warning: true, pill: { label: "Hết hạn", tone: "danger" } }
      : { text: "Chưa có HSD", warning: false, pill: null };
  }
  const today = new Date();
  const days = Math.round((Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
  const expired = days < 0 || item.status === "EXPIRED";
  const soon = !expired && days <= EXPIRING_SOON_DAYS;
  return {
    text: `HSD ${match[3]}/${match[2]}`,
    warning: expired || soon,
    pill: expired ? { label: "Hết hạn", tone: "danger" } : soon ? { label: days === 0 ? "Hôm nay" : `Còn ${days} ngày`, tone: "warning" } : null,
  };
}

type Props = {
  onItemPress?: (item: FoodItem) => void;
  onOpenFamily?: () => void;
  refreshKey?: number;
  /** From a Thông báo expiry alert: open this item's edit dialog once the list has loaded. */
  focusItemId?: string | null;
  onFocusHandled?: () => void;
};

export default function InventoryListScreen({
  onItemPress,
  onOpenFamily,
  refreshKey,
  focusItemId,
  onFocusHandled,
}: Props): React.JSX.Element {
  const { user, family, accessToken, ready } = useSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  const horizontalPadding = isCompact ? spacing.lg : isWide ? spacing.xl : spacing.xl;
  const cardGrid = useCardGrid();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<InventoryDialogMode>("edit");
  const [activeItem, setActiveItem] = useState<FoodItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState<InventoryUnit>("PIECE");
  const [editLocation, setEditLocation] = useState<InventoryLocation>("FRIDGE");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [consumeQuantity, setConsumeQuantity] = useState("1");
  const [savingItem, setSavingItem] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const loadItems = async () => {
    if (!ready) return;
    if (!user) {
      setItems([]);
      setError("Đăng nhập để xem kho.");
      setLoading(false);
      return;
    }
    if (!family?.id) {
      setItems([]);
      setError("Tạo hoặc tham gia gia đình để xem kho.");
      setLoading(false);
      return;
    }
    if (!accessToken) {
      setItems([]);
      setError("Đăng nhập để xem kho.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      // Expiry alerts are shown in Thông báo now (same inventory alerts API), not on this screen.
      const data = await inventoryApi.list(accessToken, family.id);
      setItems(data.items);
    } catch (err: any) {
      setError(err.message || "Không kết nối được API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, [user?.id, family?.id, accessToken, ready, refreshKey]);

  useEffect(() => {
    if (!focusItemId || loading) return;
    const target = items.find((item) => item.id === focusItemId);
    if (target) openEdit(target);
    else setError("Không tìm thấy nguyên liệu này trong kho. Có thể nó đã được xóa.");
    onFocusHandled?.();
    // openEdit is recreated each render; this only reacts to a new focus request or a finished load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId, loading, items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch));
  }, [items, search]);

  const openEdit = (item: FoodItem) => {
    setDialogMode("edit");
    setActiveItem(item);
    setPhotoError(null);
    setEditName(item.name);
    setEditQuantity(String(item.quantity));
    setEditUnit(item.unit as InventoryUnit);
    setEditLocation(item.storageLocation as InventoryLocation);
    setEditExpiryDate(item.expiryDate ? formatDateDdMmYyyy(item.expiryDate) : "");
  };

  const openConsume = (item: FoodItem) => {
    setDialogMode("consume");
    setActiveItem(item);
    setConsumeQuantity("1");
  };

  const closeDialog = () => {
    if (savingItem || photoBusy) return;
    setActiveItem(null);
  };

  const saveItem = async () => {
    if (!activeItem || !family?.id || !accessToken) return;
    const parsedQuantity = Number(editQuantity.replace(",", "."));
    if (!editName.trim()) { setError("Tên nguyên liệu không được để trống."); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) { setError("Số lượng phải là số không âm."); return; }
    let expiryDate: string | undefined;
    if (editExpiryDate.trim()) {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(editExpiryDate.trim());
      if (!match) { setError("Hạn dùng cần có dạng DD/MM/YYYY."); return; }
      const [, day, month, year] = match;
      const isoDate = `${year}-${month}-${day}`;
      const parsedDate = new Date(`${isoDate}T12:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== isoDate) {
        setError("Ngày hạn dùng không hợp lệ."); return;
      }
      expiryDate = `${isoDate}T00:00:00.000Z`;
    }
    setSavingItem(true);
    setError(null);
    try {
      await inventoryApi.update(accessToken, family.id, activeItem.id, {
        name: editName.trim(), quantity: parsedQuantity, unit: editUnit,
        storageLocation: editLocation, expiryDate: expiryDate ?? null,
      });
      setActiveItem(null);
      await loadItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể cập nhật nguyên liệu.");
    } finally {
      setSavingItem(false);
    }
  };

  const consumeItem = async () => {
    if (!activeItem || !family?.id || !accessToken) return;
    const amount = Number(consumeQuantity.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) { setError("Số lượng đã dùng phải lớn hơn 0."); return; }
    setSavingItem(true);
    setError(null);
    try {
      await inventoryApi.consume(accessToken, family.id, activeItem.id, amount);
      setActiveItem(null);
      await loadItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể ghi nhận lượng đã dùng.");
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = (item: FoodItem) => {
    if (!family?.id || !accessToken) return;
    Alert.alert("Xóa nguyên liệu?", `“${item.name}” sẽ được ẩn khỏi kho.`, [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa", style: "destructive", onPress: () => {
        void (async () => {
          try {
            await inventoryApi.remove(accessToken, family.id, item.id);
            await loadItems();
          } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Không thể xóa nguyên liệu.");
          }
        })();
      } },
    ]);
  };

  const applyPhotoChange = (itemId: string, imageUrl: string | null) => {
    setItems((current) => current.map((entry) => (entry.id === itemId ? { ...entry, imageUrl } : entry)));
    setActiveItem((current) => (current && current.id === itemId ? { ...current, imageUrl } : current));
  };

  const uploadPickedPhoto = async (item: FoodItem, result: PhotoPickResult) => {
    if (!accessToken) return;
    if (result.status === "denied") {
      setPhotoError(CAMERA_PERMISSION_TEXT);
      if (Platform.OS !== "web") {
        Alert.alert(CAMERA_PERMISSION_TEXT, undefined, [
          { text: "Đóng", style: "cancel" },
          { text: "Mở cài đặt", onPress: () => { void Linking.openSettings(); } },
        ]);
      }
      return;
    }
    if (result.status === "error") { setPhotoError(result.message); return; }
    if (result.status !== "picked") return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const uploaded = await inventoryApi.uploadPhoto(accessToken, item.id, result.photo);
      applyPhotoChange(item.id, uploaded.imageUrl);
    } catch {
      setPhotoError("Chưa tải được ảnh. Kiểm tra mạng rồi thử lại.");
    } finally {
      setPhotoBusy(false);
    }
  };

  /** "Đổi ảnh": camera or library on phones, the library on web. */
  /** "Đổi ảnh" / "Thêm ảnh": camera only (system camera on phones, camera file input on web). */
  const changePhoto = (item: FoodItem) => {
    setPhotoError(null);
    void takeItemPhoto().then((result) => uploadPickedPhoto(item, result));
  };

  const removePhoto = (item: FoodItem) => {
    if (!accessToken) return;
    const run = async () => {
      setPhotoBusy(true);
      setPhotoError(null);
      try {
        await inventoryApi.deletePhoto(accessToken, item.id);
        applyPhotoChange(item.id, null);
      } catch (requestError) {
        setPhotoError(requestError instanceof Error ? requestError.message : "Không xóa được ảnh.");
      } finally {
        setPhotoBusy(false);
      }
    };
    if (Platform.OS === "web") { void run(); return; }
    Alert.alert("Xóa ảnh?", `Ảnh của “${item.name}” sẽ bị xóa. Món vẫn còn trong kho.`, [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa ảnh", style: "destructive", onPress: () => { void run(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}>
        <SearchBar accessibilityLabel="Tìm trong kho thực phẩm" placeholder="Gạo, sữa, trứng..." value={search} onChangeText={setSearch} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.resultsScroller}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent, !loading && !error && filteredItems.length === 0 && styles.listFill]}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Đang tải kho...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text>
            {user && !family?.id ? (
              onOpenFamily && (
                <Pressable accessibilityRole="button" onPress={onOpenFamily} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Mở tab Gia đình</Text>
                </Pressable>
              )
            ) : user && family?.id ? (
              <Pressable accessibilityRole="button" onPress={() => void loadItems()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Thử lại</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            {filteredItems.length === 0 && (
              !family ? (
                <EmptyState fill icon={Archive} text="Tạo hoặc tham gia gia đình để bắt đầu quản lý kho." />
              ) : search.trim() && items.length > 0 ? (
                <EmptyState fill icon={Search} text="Không tìm thấy nguyên liệu phù hợp." />
              ) : (
                <EmptyState fill icon={Archive} text="Kho chưa có nguyên liệu nào." />
              )
            )}
            {filteredItems.length > 0 && (
              <View onLayout={cardGrid.onLayout} style={[styles.cardGrid, { gap: cardGrid.gap }]}>
                {filteredItems.map((item) => {
                  const expiry = expiryInfo(item);
                  const quantityText = `${item.quantity} ${inventoryUnitLabels[item.unit as InventoryUnit] ?? item.unit}`;
                  return (
                    <ProductCard
                      key={item.id}
                      width={cardGrid.cardWidth}
                      accessibilityLabel={`${item.name}, ${quantityText}, ${expiry.text}${expiry.pill ? `, ${expiry.pill.label}` : ""}. Mở để sửa, ghi đã dùng hoặc xóa`}
                      onPress={() => (onItemPress ? onItemPress(item) : openEdit(item))}
                      image={<InventoryPhoto imageUrl={item.imageUrl} accessToken={accessToken} accessibilityLabel={`Ảnh ${item.name}`} style={cardImageStyle} placeholder={<ImagePlaceholder />} />}
                      pill={expiry.pill}
                      name={item.name}
                      subtitle={quantityText}
                      footer={<CardCaption text={expiry.text} warning={expiry.warning} />}
                    />
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <Modal animationType="slide" onRequestClose={closeDialog} transparent visible={activeItem !== null}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isWide && styles.modalWide]}>
            <Text style={styles.modalTitle}>{dialogMode === "edit" ? `Sửa ${activeItem?.name ?? "nguyên liệu"}` : `Ghi lượng đã dùng`}</Text>
            {dialogMode === "edit" ? (
              <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalForm}>
                {activeItem && (
                  <View style={styles.photoBlock}>
                    <InventoryPhoto imageUrl={activeItem.imageUrl} accessToken={accessToken} accessibilityLabel={`Ảnh ${activeItem.name}`} style={styles.detailPhoto} />
                    <View style={styles.photoActions}>
                      <Pressable accessibilityRole="button" accessibilityState={{ busy: photoBusy, disabled: photoBusy }} disabled={photoBusy} onPress={() => changePhoto(activeItem)} style={styles.itemAction}>
                        <AppIcon icon={Camera} size="sm" color={colors.primary} /><Text style={styles.itemActionText}>{activeItem.imageUrl ? "Đổi ảnh" : "Thêm ảnh"}</Text>
                      </Pressable>
                      {!!activeItem.imageUrl && (
                        <Pressable accessibilityRole="button" disabled={photoBusy} onPress={() => removePhoto(activeItem)} style={styles.itemAction}>
                          <AppIcon icon={ImageMinus} size="sm" color={colors.danger} /><Text style={styles.deleteActionText}>Xóa ảnh</Text>
                        </Pressable>
                      )}
                      {photoBusy && <ActivityIndicator color={colors.primary} />}
                    </View>
                    {photoError && <Text accessibilityRole="alert" style={styles.photoErrorText}>{photoError}</Text>}
                    <View style={styles.photoActions}>
                      {activeItem.status !== "CONSUMED" && activeItem.quantity > 0 && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Ghi nhận đã dùng ${activeItem.name}`} disabled={savingItem || photoBusy} onPress={() => openConsume(activeItem)} style={styles.itemAction}>
                          <Text style={styles.itemActionText}>Đã dùng</Text>
                        </Pressable>
                      )}
                      <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${activeItem.name}`} disabled={savingItem || photoBusy} onPress={() => { const item = activeItem; setActiveItem(null); deleteItem(item); }} style={styles.itemAction}>
                        <AppIcon icon={Trash2} size="sm" color={colors.danger} /><Text style={styles.deleteActionText}>Xóa</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <Text style={styles.fieldLabel}>Tên nguyên liệu</Text>
                <TextInput accessibilityLabel="Tên nguyên liệu" value={editName} onChangeText={setEditName} style={styles.modalInput} />
                <Text style={styles.fieldLabel}>Số lượng còn lại</Text>
                <TextInput accessibilityLabel="Số lượng còn lại" value={editQuantity} onChangeText={setEditQuantity} keyboardType="decimal-pad" style={styles.modalInput} />
                <RadioDropdown<InventoryUnit> label="Đơn vị" value={editUnit} options={inventoryUnits.map((choice) => ({ value: choice, label: inventoryUnitLabels[choice] }))} onChange={setEditUnit} searchable searchPlaceholder="Tìm đơn vị (kg, hộp...)" />
                <RadioDropdown<InventoryLocation> label="Vị trí bảo quản" value={editLocation} options={inventoryLocations.map((choice) => ({ value: choice, label: inventoryLocationLabels[choice] }))} onChange={setEditLocation} />
                <Text style={styles.fieldLabel}>Hạn dùng · DD/MM/YYYY</Text>
                <TextInput accessibilityLabel="Hạn dùng theo DD/MM/YYYY, để trống nếu không có" value={editExpiryDate} onChangeText={setEditExpiryDate} placeholder="31/12/2026" style={styles.modalInput} />
              </ScrollView>
            ) : (
              <View style={styles.modalForm}>
                <Text style={styles.fieldLabel}>Số lượng đã dùng ({activeItem ? inventoryUnitLabels[activeItem.unit as InventoryUnit] ?? activeItem.unit : ""})</Text>
                <TextInput accessibilityLabel={`Số lượng đã dùng, đơn vị ${activeItem ? inventoryUnitLabels[activeItem.unit as InventoryUnit] ?? activeItem.unit : ""}`} value={consumeQuantity} onChangeText={setConsumeQuantity} keyboardType="decimal-pad" style={styles.modalInput} />
                <Text style={styles.alertHint}>Còn trong kho: {activeItem?.quantity} {activeItem ? inventoryUnitLabels[activeItem.unit as InventoryUnit] ?? activeItem.unit : ""}. Lượng dùng được ghi vào lịch sử tiêu thụ để tạo gợi ý mua.</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={savingItem} onPress={closeDialog} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Hủy</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: savingItem, disabled: savingItem }} disabled={savingItem} onPress={() => void (dialogMode === "edit" ? saveItem() : consumeItem())} style={[styles.saveButton, savingItem && styles.saveButtonDisabled]}>
                {savingItem ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>{dialogMode === "edit" ? "Lưu thay đổi" : "Xác nhận đã dùng"}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignSelf: "center", maxWidth: 920, paddingTop: spacing.xl, width: "100%" },
  wideContent: { alignSelf: "center", maxWidth: 920, width: "100%" },
  listContent: { alignSelf: "center", paddingBottom: spacing.xl, paddingTop: SEARCH_CONTENT_GAP, width: "100%" },
  resultsScroller: { flex: 1 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap" },
  listFill: { flexGrow: 1 },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: { color: colors.muted, ...typography.bodySmall, marginTop: spacing.md },
  errorText: {
    color: colors.danger,
    ...typography.bodySmall,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  retryBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.surface, ...typography.labelSmall },
  alertHint: { color: colors.muted, ...typography.bodySmall },
  itemAction: { alignItems: "center", borderColor: colors.border, borderRadius: 6, borderWidth: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.sm },
  itemActionText: { color: colors.primary, ...typography.labelSmall },
  deleteActionText: { color: colors.danger, ...typography.labelSmall },
  modalBackdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  modalCard: { alignSelf: "center", backgroundColor: colors.surface, borderRadius: 12, gap: spacing.md, maxHeight: "90%", padding: spacing.lg, width: "100%" },
  modalWide: { maxWidth: 560 },
  modalTitle: { color: colors.text, ...typography.heading },
  modalForm: { gap: spacing.sm, paddingBottom: spacing.sm },
  fieldLabel: { color: colors.muted, ...typography.labelSmall, marginTop: spacing.xs },
  modalInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: 44, paddingHorizontal: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: colors.border, borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  cancelButtonText: { color: colors.muted, ...typography.labelSmall },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.surface, ...typography.labelSmall },
  photoBlock: { gap: spacing.sm, marginBottom: spacing.sm },
  detailPhoto: { alignSelf: "center", height: 180, width: "100%" },
  photoActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoErrorText: { ...textStyles.bodySmall, color: colors.danger },
});
