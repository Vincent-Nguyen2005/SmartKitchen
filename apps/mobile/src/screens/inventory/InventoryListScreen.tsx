import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Package, Pencil, Search, Trash2, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, spacing, textStyles, touchTarget, typography } from "../../theme";
import { FoodItem } from "./types";
import { useSession } from "../../services/session";
import { InventoryLocation, InventoryUnit, inventoryApi } from "./inventoryApi";
import InventoryCapturePanel from "./InventoryCapturePanel";

const categories = ["All", "FRIDGE", "FREEZER", "PANTRY", "COUNTER"];
const inventoryUnits: InventoryUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const inventoryLocations: InventoryLocation[] = ["FRIDGE", "FREEZER", "PANTRY", "COUNTER"];
type InventoryDialogMode = "edit" | "consume";

type Props = {
  onItemPress?: (item: FoodItem) => void;
  onOpenFamily?: () => void;
};

export default function InventoryListScreen({
  onItemPress,
  onOpenFamily,
}: Props): React.JSX.Element {
  const { user, family, accessToken, ready } = useSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  const horizontalPadding = isCompact ? spacing.lg : isWide ? spacing.xl : spacing.xl;
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [expiringItems, setExpiringItems] = useState<Awaited<ReturnType<typeof inventoryApi.expiring>>["items"]>([]);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const [dialogMode, setDialogMode] = useState<InventoryDialogMode>("edit");
  const [activeItem, setActiveItem] = useState<FoodItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState<InventoryUnit>("PIECE");
  const [editLocation, setEditLocation] = useState<InventoryLocation>("FRIDGE");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [consumeQuantity, setConsumeQuantity] = useState("1");
  const [savingItem, setSavingItem] = useState(false);

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
      const [data, alerts] = await Promise.all([
        inventoryApi.list(accessToken, family.id),
        inventoryApi.expiring(accessToken, family.id, 3).catch(() => null),
      ]);
      setItems(data.items);
      setExpiringItems(alerts?.items ?? []);
      setAlertError(alerts ? null : "Không tải được cảnh báo hạn dùng.");
    } catch (err: any) {
      setError(err.message || "Không kết nối được API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, [user?.id, family?.id, accessToken, ready]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory =
        activeCategory === "All" || item.storageLocation === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, items, search]);

  const openEdit = (item: FoodItem) => {
    setDialogMode("edit");
    setActiveItem(item);
    setEditName(item.name);
    setEditQuantity(String(item.quantity));
    setEditUnit(item.unit as InventoryUnit);
    setEditLocation(item.storageLocation as InventoryLocation);
    setEditExpiryDate(item.expiryDate ? item.expiryDate.slice(0, 10) : "");
  };

  const openConsume = (item: FoodItem) => {
    setDialogMode("consume");
    setActiveItem(item);
    setConsumeQuantity("1");
  };

  const closeDialog = () => {
    if (savingItem) return;
    setActiveItem(null);
  };

  const saveItem = async () => {
    if (!activeItem || !family?.id || !accessToken) return;
    const parsedQuantity = Number(editQuantity.replace(",", "."));
    if (!editName.trim()) { setError("Tên nguyên liệu không được để trống."); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) { setError("Số lượng phải là số không âm."); return; }
    let expiryDate: string | undefined;
    if (editExpiryDate.trim()) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(editExpiryDate.trim());
      if (!match) { setError("Hạn dùng cần có dạng YYYY-MM-DD."); return; }
      const parsedDate = new Date(`${editExpiryDate.trim()}T12:00:00.000Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== editExpiryDate.trim()) {
        setError("Ngày hạn dùng không hợp lệ."); return;
      }
      expiryDate = parsedDate.toISOString();
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

  const refreshAlerts = async () => {
    if (!family?.id || !accessToken) return;
    setAlertBusy(true);
    setAlertError(null);
    try {
      await inventoryApi.refreshAlerts(accessToken, family.id, 3);
      await loadItems();
    } catch (requestError) {
      setAlertError(requestError instanceof Error ? requestError.message : "Không thể làm mới cảnh báo.");
    } finally {
      setAlertBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}>
        <Text style={styles.eyebrow}>SMARTKITCHEN / INVENTORY</Text>
        <Text style={styles.title}>Kho của bạn</Text>
        <Text style={styles.subtitle}>
          {items.length} nguyên liệu trong kho
        </Text>
        <View style={styles.searchBox}>
          <AppIcon icon={Search} size="md" color={colors.primary} />
          <TextInput
            accessibilityLabel="Tìm trong kho thực phẩm"
            onChangeText={setSearch}
            placeholder="Gạo, sữa, trứng..."
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          {search.length > 0 && (
            <IconButton accessibilityLabel="Xóa nội dung tìm kiếm" icon={X} onPress={() => setSearch("")} />
          )}
        </View>
      </View>

      <View style={[styles.categoryScroller, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}>
        <View style={styles.categoryRail}>
          {categories.map((category) => {
            const active = category === activeCategory;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={category === "All" ? "Tất cả vị trí" : `Vị trí ${category}`}
                key={category}
                onPress={() => setActiveCategory(category)}
                style={[styles.categoryButton, active && styles.categoryButtonActive]}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.resultsScroller}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}
        keyboardShouldPersistTaps="handled"
      >
        {family?.id && accessToken && (
          <InventoryCapturePanel familyId={family.id} accessToken={accessToken} onSaved={() => void loadItems()} />
        )}
        {family && !loading && (
          <View style={styles.alertPanel}>
            <View style={styles.alertHeader}>
              <View style={styles.alertHeading}>
                <Text style={styles.alertTitle}>Sắp hoặc đã hết hạn</Text>
                <Text style={styles.alertHint}>Đã quá hạn hoặc hạn trong 3 ngày tới</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cập nhật trạng thái cảnh báo hạn dùng" accessibilityState={{ busy: alertBusy }} disabled={alertBusy} onPress={() => void refreshAlerts()} style={styles.alertRefresh}>
                {alertBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.alertRefreshText}>Cập nhật</Text>}
              </Pressable>
            </View>
            {alertError ? <Text accessibilityRole="alert" style={styles.alertError}>{alertError}</Text> : expiringItems.length === 0 ? <Text style={styles.alertHint}>Không có nguyên liệu quá hạn hoặc sắp hết hạn.</Text> : expiringItems.map((item) => (
              <Text key={item.id} style={item.daysLeft < 0 ? styles.expiredText : styles.nearExpiryText}>
                {item.name} · {item.daysLeft < 0 ? `Đã quá hạn ${Math.abs(item.daysLeft)} ngày` : item.daysLeft === 0 ? "Hết hạn hôm nay" : `Còn ${item.daysLeft} ngày`}
              </Text>
            ))}
          </View>
        )}
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
            <Text style={styles.resultCount}>{filteredItems.length} NGUYÊN LIỆU</Text>
            {filteredItems.length === 0 && (
              <Text style={styles.emptyText}>{family ? "Chưa có nguyên liệu nào." : "Tạo hoặc tham gia gia đình để bắt đầu quản lý kho."}</Text>
            )}
            {filteredItems.map((item, index) => {
            const isNearExpiry = item.status === "NEAR_EXPIRY";
            const isExpired = item.status === "EXPIRED";
            return (
              <View
                key={item.id}
                style={[styles.recipeRow, { gap: isCompact ? spacing.md : spacing.lg }]}
              >
                <View style={[styles.imageWrap, { width: isCompact ? 76 : 112, height: isCompact ? 96 : 126 }]}>
                  <View
                    style={[
                      styles.placeholderImage,
                      isExpired && { backgroundColor: colors.dangerSoft },
                      isNearExpiry && { backgroundColor: colors.warning },
                    ]}
                  >
                    <AppIcon icon={Package} size="lg" color={colors.primary} />
                  </View>
                  <Text
                    style={[
                      styles.indexMark,
                      index % 2 === 0 ? styles.indexWarm : styles.indexCool,
                    ]}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeCategory}>
                    {item.storageLocation}
                  </Text>
                  <Pressable accessibilityRole={onItemPress ? "button" : undefined} disabled={!onItemPress} onPress={() => onItemPress?.(item)}>
                    <Text style={styles.recipeTitle}>{item.name}</Text>
                  </Pressable>
                  <Text numberOfLines={2} style={styles.recipeDescription}>
                    {item.quantity} {item.unit}
                    {item.expiryDate &&
                      ` • HSD: ${new Date(item.expiryDate).toLocaleDateString("vi-VN")}`}
                  </Text>
                  <View style={styles.recipeMeta}>
                    <Text style={styles.metaText}>{item.status}</Text>
                    <View style={styles.metaDot} />
                    <Text style={styles.metaText}>
                      {item.quantity} {item.unit}
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Sửa ${item.name}`} onPress={() => openEdit(item)} style={styles.itemAction}>
                      <AppIcon icon={Pencil} size="sm" color={colors.primary} /><Text style={styles.itemActionText}>Sửa</Text>
                    </Pressable>
                    {item.status !== "CONSUMED" && item.quantity > 0 && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Ghi nhận đã dùng ${item.name}`} onPress={() => openConsume(item)} style={styles.itemAction}>
                        <Text style={styles.itemActionText}>Đã dùng</Text>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${item.name}`} onPress={() => deleteItem(item)} style={styles.itemAction}>
                      <AppIcon icon={Trash2} size="sm" color={colors.danger} /><Text style={styles.deleteActionText}>Xóa</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
            })}
          </>
        )}
      </ScrollView>
      <Modal animationType="slide" onRequestClose={closeDialog} transparent visible={activeItem !== null}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isWide && styles.modalWide]}>
            <Text style={styles.modalTitle}>{dialogMode === "edit" ? `Sửa ${activeItem?.name ?? "nguyên liệu"}` : `Ghi lượng đã dùng`}</Text>
            {dialogMode === "edit" ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalForm}>
                <Text style={styles.fieldLabel}>Tên nguyên liệu</Text>
                <TextInput accessibilityLabel="Tên nguyên liệu" value={editName} onChangeText={setEditName} style={styles.modalInput} />
                <Text style={styles.fieldLabel}>Số lượng còn lại</Text>
                <TextInput accessibilityLabel="Số lượng còn lại" value={editQuantity} onChangeText={setEditQuantity} keyboardType="decimal-pad" style={styles.modalInput} />
                <Text style={styles.fieldLabel}>Đơn vị</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRail}>
                  {inventoryUnits.map((choice) => <Pressable accessibilityRole="button" accessibilityState={{ selected: editUnit === choice }} key={choice} onPress={() => setEditUnit(choice)} style={[styles.choiceChip, editUnit === choice && styles.choiceChipActive]}><Text style={[styles.choiceText, editUnit === choice && styles.choiceTextActive]}>{choice}</Text></Pressable>)}
                </ScrollView>
                <Text style={styles.fieldLabel}>Vị trí</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRail}>
                  {inventoryLocations.map((choice) => <Pressable accessibilityRole="button" accessibilityState={{ selected: editLocation === choice }} key={choice} onPress={() => setEditLocation(choice)} style={[styles.choiceChip, editLocation === choice && styles.choiceChipActive]}><Text style={[styles.choiceText, editLocation === choice && styles.choiceTextActive]}>{choice}</Text></Pressable>)}
                </ScrollView>
                <Text style={styles.fieldLabel}>Hạn dùng · YYYY-MM-DD</Text>
                <TextInput accessibilityLabel="Hạn dùng theo YYYY-MM-DD, để trống nếu không có" value={editExpiryDate} onChangeText={setEditExpiryDate} placeholder="2026-12-31" style={styles.modalInput} />
              </ScrollView>
            ) : (
              <View style={styles.modalForm}>
                <Text style={styles.fieldLabel}>Số lượng đã dùng ({activeItem?.unit})</Text>
                <TextInput accessibilityLabel={`Số lượng đã dùng, đơn vị ${activeItem?.unit}`} value={consumeQuantity} onChangeText={setConsumeQuantity} keyboardType="decimal-pad" style={styles.modalInput} />
                <Text style={styles.alertHint}>Còn trong kho: {activeItem?.quantity} {activeItem?.unit}. Lượng dùng được ghi vào lịch sử tiêu thụ để tạo gợi ý mua.</Text>
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
  eyebrow: {
    color: colors.primary,
    ...typography.caption,
    letterSpacing: 1.4,
  },
  title: {
    ...textStyles.pageTitle,
    color: colors.text,
    fontWeight: "700",
    marginTop: spacing.lg,
  },
  subtitle: { color: colors.muted, ...typography.bodySmall, marginTop: spacing.sm },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: spacing.xl,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  searchInput: { color: colors.text, flex: 1, fontFamily, fontSize: typography.body.fontSize, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  categoryScroller: { alignSelf: "center", flexShrink: 0, width: "100%" },
  categoryRail: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  categoryButton: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 24,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: touchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  categoryButtonActive: { backgroundColor: colors.primary },
  categoryText: { color: colors.muted, ...typography.labelSmall },
  categoryTextActive: { color: colors.surface },
  listContent: { alignSelf: "center", paddingBottom: spacing.xl, width: "100%" },
  resultsScroller: { flex: 1 },
  resultCount: {
    color: colors.muted,
    ...typography.caption,
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  recipeRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  imageWrap: { height: 126, position: "relative", width: 112 },
  placeholderImage: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  indexMark: {
    alignItems: "center",
    borderRadius: 4,
    bottom: spacing.xs,
    color: colors.text,
    ...typography.caption,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: "absolute",
    right: spacing.xs,
  },
  indexWarm: { backgroundColor: colors.warning },
  indexCool: { backgroundColor: colors.primarySoft },
  recipeInfo: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  recipeCategory: {
    color: colors.primary,
    ...typography.caption,
    letterSpacing: 1.1,
    marginBottom: spacing.xs,
  },
  recipeTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  recipeDescription: {
    color: colors.muted,
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  recipeMeta: { alignItems: "center", flexDirection: "row", marginTop: spacing.md },
  metaText: { color: colors.muted, ...typography.caption },
  metaDot: {
    backgroundColor: colors.border,
    borderRadius: 3,
    height: 4,
    marginHorizontal: spacing.sm,
    width: 4,
  },
  emptyText: {
    color: colors.muted,
    ...typography.body,
    paddingVertical: spacing.xl,
  },
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
  alertPanel: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: 9, borderWidth: 1, gap: spacing.sm, marginBottom: spacing.xl, padding: spacing.md },
  alertHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  alertHeading: { flex: 1, minWidth: 0 },
  alertTitle: { color: colors.warning, ...typography.subheading },
  alertHint: { color: colors.muted, ...typography.bodySmall },
  alertRefresh: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: 70, paddingHorizontal: spacing.sm },
  alertRefreshText: { color: colors.primary, ...typography.labelSmall },
  alertError: { color: colors.danger, ...typography.bodySmall },
  expiredText: { color: colors.danger, ...typography.bodySmall },
  nearExpiryText: { color: colors.warning, ...typography.bodySmall },
  itemActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
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
  choiceRail: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  choiceChip: { backgroundColor: colors.primarySoft, borderRadius: 16, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  choiceChipActive: { backgroundColor: colors.primary },
  choiceText: { color: colors.muted, ...typography.labelSmall },
  choiceTextActive: { color: colors.surface },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: colors.border, borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  cancelButtonText: { color: colors.muted, ...typography.labelSmall },
  saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.surface, ...typography.labelSmall },
});
