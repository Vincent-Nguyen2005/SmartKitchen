import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState } from "../notifications/ui";
import { CardCaption, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { SEARCH_CONTENT_GAP, SEARCH_MAX_WIDTH, SearchHeader } from "../../components/SearchBar";
import { FoodItem } from "./types";
import { useSession } from "../../services/session";
import { InventoryLocation, InventoryUnit, inventoryApi } from "./inventoryApi";
import { CAMERA_PERMISSION_TEXT, InventoryPhoto, takeItemPhoto, type PhotoPickResult } from "./inventoryPhoto";
import { photoUploadErrorMessage } from "./photoUpload";
import { filterByName } from "../../services/localSearch";
import { catalogImageFor, catalogUnitLabelFor, useCatalogImages } from "./catalogImages";
import { choiceFor, choiceLabel, kitchenAmount, UNIT_CHOICES } from "./unitChoices";
import { expiryInfo } from "./expiry";

const inventoryLocations: InventoryLocation[] = ["FRIDGE", "FREEZER", "PANTRY", "COUNTER"];
const inventoryLocationLabels: Record<InventoryLocation, string> = {
  FRIDGE: "Tủ lạnh", FREEZER: "Ngăn đông", PANTRY: "Tủ đựng thực phẩm", COUNTER: "Kệ bếp",
};

function formatDateDdMmYyyy(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Bought in Đi chợ: only the storage place can change (no photo, no delete); cooking lowers the quantity. */
const isLocked = (item: FoodItem): boolean => item.origin === "PURCHASE";
/** One line for a bought item: "Mua ở Đi chợ ngày 28/11/2026 · Tự trừ khi nấu". */
const lockedNote = (item: FoodItem): string =>
  `Mua ở Đi chợ${item.purchasedAt ? ` ngày ${formatDateDdMmYyyy(item.purchasedAt)}` : ""} · Tự trừ khi nấu`;


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
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Items without their own photo show the matching catalog product image (display only, never stored).
  const catalogImages = useCatalogImages(accessToken);
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  const horizontalPadding = isCompact ? spacing.lg : isWide ? spacing.xl : spacing.xl;
  const cardGrid = useCardGrid();
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeItem, setActiveItem] = useState<FoodItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  // Picker value: a specific word (gói, quả, kg...) mapped to the stored unit + piece word on save (unitChoices.ts).
  const [editUnit, setEditUnit] = useState<string>("cái");
  const [editLocation, setEditLocation] = useState<InventoryLocation>("FRIDGE");
  const [editExpiryDate, setEditExpiryDate] = useState("");
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
    // Case- and accent-insensitive on the loaded items ("ca rot" finds "Cà rốt"); typing sends no request.
    return filterByName(items, search);
  }, [items, search]);

  // A new search shows its results from the top.
  const listRef = useRef<FlatList<FoodItem>>(null);
  useEffect(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [search]);

  const openEdit = (item: FoodItem) => {
    setActiveItem(item);
    setPhotoError(null);
    setEditName(item.name);
    setEditQuantity(String(item.quantity));
    setEditUnit(choiceLabel(item.unit, catalogUnitLabelFor(item, catalogImages) ?? item.unitLabel));
    setEditLocation(item.storageLocation as InventoryLocation);
    setEditExpiryDate(item.expiryDate ? formatDateDdMmYyyy(item.expiryDate) : "");
  };

  const closeDialog = () => {
    if (savingItem || photoBusy) return;
    setActiveItem(null);
  };

  const saveItem = async () => {
    if (!activeItem || !family?.id || !accessToken) return;
    if (isLocked(activeItem)) {
      setSavingItem(true);
      setError(null);
      try {
        await inventoryApi.update(accessToken, family.id, activeItem.id, { storageLocation: editLocation });
        setActiveItem(null);
        await loadItems();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Không thể cập nhật nguyên liệu.");
      } finally {
        setSavingItem(false);
      }
      return;
    }
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
        name: editName.trim(), quantity: parsedQuantity,
        unit: (choiceFor(editUnit)?.unit ?? activeItem.unit) as InventoryUnit, unitLabel: choiceFor(editUnit)?.unitLabel ?? null,
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

  const deleteItem = async (item: FoodItem) => {
    if (!family?.id || !accessToken) return;
    if (!(await confirm({ title: "Xóa nguyên liệu?", message: `“${item.name}” sẽ được ẩn khỏi kho.`, confirmLabel: "Xóa", destructive: true }))) return;
    try {
      await inventoryApi.remove(accessToken, family.id, item.id);
      await loadItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xóa nguyên liệu.");
    }
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
    } catch (error) {
      setPhotoError(photoUploadErrorMessage(error));
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

  const renderItem = (item: FoodItem) => {
    const expiry = expiryInfo(item);
    // "1 gói", "2 quả", "1,5 kg": the linked product's word, else the word chosen in Kho (never "gói/bó").
    const quantityText = kitchenAmount(item, catalogUnitLabelFor(item, catalogImages));
    return (
      <ProductCard
        width={cardGrid.cardWidth}
        accessibilityLabel={`${item.name}, ${quantityText}, ${expiry.text}${expiry.pill ? `, ${expiry.pill.label}` : ""}. Mở để sửa, ghi đã dùng hoặc xóa`}
        onPress={() => (onItemPress ? onItemPress(item) : openEdit(item))}
        image={<InventoryPhoto imageUrl={item.imageUrl} fallbackUrl={catalogImageFor(item, catalogImages)} accessToken={accessToken} accessibilityLabel={`Ảnh ${item.name}`} style={cardImageStyle} placeholder={<ImagePlaceholder />} />}
        pill={expiry.pill}
        name={item.name}
        subtitle={quantityText}
        footer={<CardCaption text={expiry.text} tone={expiry.tone} />}
      />
    );
  };

  return (
    // Left / right edges only, like Đi chợ: the tab bar is already below the status bar, so the top inset would push
    // Kho's search box lower than Đi chợ's.
    <SafeAreaView edges={["left", "right"]} style={styles.safeArea}>
      <SearchHeader horizontalPadding={horizontalPadding} wide={isWide} accessibilityLabel="Tìm trong kho thực phẩm" placeholder="Gạo, sữa, trứng..." value={search} onChangeText={setSearch} />

      <View style={[styles.resultsScroller, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}>
        {/* One virtualized grid of every Kho item (the API pages are loaded up front; search filters them here). */}
        <FlatList
          ref={listRef}
          // numColumns cannot change on a mounted FlatList.
          key={`cols-${cardGrid.columns}`}
          data={loading || error ? [] : filteredItems}
          numColumns={cardGrid.columns}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderItem(item)}
          onLayout={cardGrid.onLayout}
          columnWrapperStyle={cardGrid.columns > 1 ? { gap: cardGrid.gap } : undefined}
          contentContainerStyle={[styles.listContent, { gap: cardGrid.gap }, (loading || !!error || filteredItems.length === 0) && styles.listFill]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={loading ? (
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
          ) : !family ? (
            <EmptyState fill icon={Archive} text="Tạo hoặc tham gia gia đình để bắt đầu quản lý kho." />
          ) : search.trim() && items.length > 0 ? (
            <EmptyState fill icon={Search} text="Không tìm thấy nguyên liệu phù hợp." />
          ) : (
            <EmptyState fill icon={Archive} text="Kho chưa có nguyên liệu nào." />
          )}
        />
      </View>
      <Modal animationType="slide" onRequestClose={closeDialog} transparent visible={activeItem !== null}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isWide && styles.modalWide]}>
            <Text style={styles.modalTitle}>{activeItem && isLocked(activeItem) ? activeItem.name : `Sửa ${activeItem?.name ?? "nguyên liệu"}`}</Text>
            {(
              <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalForm}>
                {activeItem && (
                  <View style={styles.photoBlock}>
                    <InventoryPhoto imageUrl={activeItem.imageUrl} fallbackUrl={catalogImageFor(activeItem, catalogImages)} accessToken={accessToken} accessibilityLabel={`Ảnh ${activeItem.name}`} style={styles.detailPhoto} />
                    {!isLocked(activeItem) && (<>
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
                      <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${activeItem.name}`} disabled={savingItem || photoBusy} onPress={() => { const item = activeItem; setActiveItem(null); void deleteItem(item); }} style={styles.itemAction}>
                        <AppIcon icon={Trash2} size="sm" color={colors.danger} /><Text style={styles.deleteActionText}>Xóa</Text>
                      </Pressable>
                    </View>
                    </>)}
                  </View>
                )}
                {activeItem && isLocked(activeItem) ? (
                  // Bought in Đi chợ: shown, not editable (the server refuses changes); cooking lowers the quantity.
                  <View style={styles.lockedBox}>
                    <Text style={styles.alertHint}>{lockedNote(activeItem)}</Text>
                    <Text style={styles.fieldLabel}>Số lượng còn lại</Text>
                    <Text style={styles.lockedValue}>{kitchenAmount(activeItem, catalogUnitLabelFor(activeItem, catalogImages))}</Text>
                    <Text style={styles.fieldLabel}>Hạn dùng</Text>
                    <Text style={styles.lockedValue}>{activeItem.expiryDate ? formatDateDdMmYyyy(activeItem.expiryDate) : "Chưa có"}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Tên nguyên liệu</Text>
                    <TextInput accessibilityLabel="Tên nguyên liệu" value={editName} onChangeText={setEditName} style={styles.modalInput} />
                    <Text style={styles.fieldLabel}>Số lượng còn lại</Text>
                    <TextInput accessibilityLabel="Số lượng còn lại" value={editQuantity} onChangeText={setEditQuantity} keyboardType="decimal-pad" style={styles.modalInput} />
                    <RadioDropdown<string> label="Đơn vị" value={editUnit} options={UNIT_CHOICES.map((choice) => ({ value: choice.label, label: choice.label }))} onChange={setEditUnit} searchable searchPlaceholder="Tìm đơn vị (kg, hộp...)" />
                  </>
                )}
                <RadioDropdown<InventoryLocation> label="Vị trí bảo quản" value={editLocation} options={inventoryLocations.map((choice) => ({ value: choice, label: inventoryLocationLabels[choice] }))} onChange={setEditLocation} />
                {activeItem && !isLocked(activeItem) && (
                  <>
                    <Text style={styles.fieldLabel}>Hạn dùng · DD/MM/YYYY</Text>
                    <TextInput accessibilityLabel="Hạn dùng theo DD/MM/YYYY, để trống nếu không có" value={editExpiryDate} onChangeText={setEditExpiryDate} placeholder="31/12/2026" style={styles.modalInput} />
                  </>
                )}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={savingItem} onPress={closeDialog} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Hủy</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: savingItem, disabled: savingItem }} disabled={savingItem} onPress={() => void saveItem()} style={[styles.saveButton, savingItem && styles.saveButtonDisabled]}>
                {savingItem ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveButtonText}>Lưu thay đổi</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {confirmDialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  wideContent: { alignSelf: "center", maxWidth: SEARCH_MAX_WIDTH, width: "100%" },
  // Extra bottom room so the last row clears the bottom action bar's shadow edge.
  listContent: { paddingBottom: spacing.xl * 2, paddingTop: SEARCH_CONTENT_GAP },
  resultsScroller: { flex: 1 },
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
  lockedBox: { backgroundColor: colors.background, borderRadius: 7, gap: spacing.xs, padding: spacing.md },
  lockedValue: { color: colors.text, ...typography.body },
});
