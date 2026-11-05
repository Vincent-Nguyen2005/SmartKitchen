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
};

export default function InventoryListScreen({
  onItemPress,
}: Props): React.JSX.Element {
  const { family, accessToken, ready } = useSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  const horizontalPadding = isCompact ? 16 : isWide ? 32 : 22;
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
    if (!family?.id || !accessToken) {
      setItems([]);
      setError("Đăng nhập và tạo hoặc tham gia gia đình để xem kho thực phẩm.");
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
  }, [family?.id, accessToken, ready]);

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
        <Text style={[styles.title, isCompact && styles.compactTitle]}>Kho của bạn</Text>
        <Text style={styles.subtitle}>
          {items.length} nguyên liệu trong kho
        </Text>
        <View style={styles.searchBox}>
          <Search color="#A75132" size={18} />
          <TextInput
            accessibilityLabel="Tìm trong kho thực phẩm"
            onChangeText={setSearch}
            placeholder="Gạo, sữa, trứng..."
            placeholderTextColor="#77847C"
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          {search.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Xóa nội dung tìm kiếm" onPress={() => setSearch("")} style={styles.clearButton}>
              <X color="#27634B" size={18} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.categoryScroller, isWide && styles.wideContent]}
        contentContainerStyle={[styles.categoryRail, { paddingHorizontal: horizontalPadding }]}
      >
        {categories.map((category) => {
          const active = category === activeCategory;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={category === "All" ? "Tất cả vị trí" : `Vị trí ${category}`}
              key={category}
              onPress={() => setActiveCategory(category)}
              style={[
                styles.categoryButton,
                active && styles.categoryButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  active && styles.categoryTextActive,
                ]}
              >
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.resultsScroller}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}
        keyboardShouldPersistTaps="handled"
      >
        <InventoryCapturePanel familyId={family?.id ?? null} accessToken={accessToken} onSaved={() => void loadItems()} />
        {family && !loading && (
          <View style={styles.alertPanel}>
            <View style={styles.alertHeader}>
              <View style={styles.alertHeading}>
                <Text style={styles.alertTitle}>Sắp hoặc đã hết hạn</Text>
                <Text style={styles.alertHint}>Đã quá hạn hoặc hạn trong 3 ngày tới</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cập nhật trạng thái cảnh báo hạn dùng" accessibilityState={{ busy: alertBusy }} disabled={alertBusy} onPress={() => void refreshAlerts()} style={styles.alertRefresh}>
                {alertBusy ? <ActivityIndicator size="small" color="#215B43" /> : <Text style={styles.alertRefreshText}>Cập nhật</Text>}
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
            <ActivityIndicator size="large" color="#215B43" />
            <Text style={styles.loadingText}>Đang tải kho...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>⚠️ {error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadItems()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
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
                style={[styles.recipeRow, { gap: isCompact ? 10 : 14 }]}
              >
                <View style={[styles.imageWrap, { width: isCompact ? 76 : 112, height: isCompact ? 96 : 126 }]}>
                  <View
                    style={[
                      styles.placeholderImage,
                      isExpired && { backgroundColor: "#F4C7C3" },
                      isNearExpiry && { backgroundColor: "#F3C875" },
                    ]}
                  >
                    <Package color="#547364" size={28} strokeWidth={1.8} />
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
                      <Pencil color="#215B43" size={14} /><Text style={styles.itemActionText}>Sửa</Text>
                    </Pressable>
                    {item.status !== "CONSUMED" && item.quantity > 0 && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Ghi nhận đã dùng ${item.name}`} onPress={() => openConsume(item)} style={styles.itemAction}>
                        <Text style={styles.itemActionText}>Đã dùng</Text>
                      </Pressable>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${item.name}`} onPress={() => deleteItem(item)} style={styles.itemAction}>
                      <Trash2 color="#A75132" size={14} /><Text style={styles.deleteActionText}>Xóa</Text>
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
                {savingItem ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>{dialogMode === "edit" ? "Lưu thay đổi" : "Xác nhận đã dùng"}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F3F6F0", flex: 1 },
  header: { alignSelf: "center", maxWidth: 920, paddingTop: 18, width: "100%" },
  wideContent: { alignSelf: "center", maxWidth: 920, width: "100%" },
  eyebrow: {
    color: "#547364",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#17271F",
    fontSize: 32,
    marginTop: 14,
  },
  compactTitle: { fontSize: 28 },
  subtitle: { color: "#64736A", fontSize: 14, lineHeight: 20, marginTop: 6 },
  searchBox: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DDE5DC",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    minHeight: 52,
    paddingHorizontal: 13,
  },
  searchInput: { color: "#17271F", flex: 1, fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 },
  clearButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  categoryScroller: { alignSelf: "center", flexGrow: 0, flexShrink: 0, height: 72, width: "100%" },
  categoryRail: { alignItems: "center", gap: 8 },
  categoryButton: {
    alignItems: "center",
    backgroundColor: "#E5EBE3",
    borderRadius: 24,
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
    justifyContent: "center",
    minWidth: 64,
    paddingHorizontal: 18,
  },
  categoryButtonActive: { backgroundColor: "#215B43" },
  categoryText: { color: "#4A5E51", fontSize: 13, fontWeight: "600" },
  categoryTextActive: { color: "#FFFFFF" },
  listContent: { alignSelf: "center", paddingBottom: 28, width: "100%" },
  resultsScroller: { flex: 1 },
  resultCount: {
    color: "#79857C",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  recipeRow: {
    borderBottomColor: "#DDE5DC",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    paddingVertical: 15,
  },
  imageWrap: { height: 126, position: "relative", width: 112 },
  placeholderImage: {
    alignItems: "center",
    backgroundColor: "#D9E1D8",
    borderRadius: 6,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  indexMark: {
    alignItems: "center",
    borderRadius: 4,
    bottom: 7,
    color: "#17271F",
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
    position: "absolute",
    right: 7,
  },
  indexWarm: { backgroundColor: "#F3C875" },
  indexCool: { backgroundColor: "#B7D5C2" },
  recipeInfo: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingVertical: 2,
  },
  recipeCategory: {
    color: "#A75132",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  recipeTitle: {
    color: "#17271F",
    fontSize: 19,
    lineHeight: 23,
  },
  recipeDescription: {
    color: "#67746B",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  recipeMeta: { alignItems: "center", flexDirection: "row", marginTop: 11 },
  metaText: { color: "#59685E", fontSize: 10, fontWeight: "600" },
  metaDot: {
    backgroundColor: "#C2CDC3",
    borderRadius: 3,
    height: 4,
    marginHorizontal: 7,
    width: 4,
  },
  emptyText: {
    color: "#64736A",
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 28,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 40,
  },
  loadingText: { color: "#64736A", fontSize: 14, marginTop: 12 },
  errorText: {
    color: "#A75132",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  retryBtn: {
    alignItems: "center",
    backgroundColor: "#215B43",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  alertPanel: { backgroundColor: "#FFF9E6", borderColor: "#F0D98F", borderRadius: 9, borderWidth: 1, gap: 7, marginBottom: 18, padding: 12 },
  alertHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  alertHeading: { flex: 1, minWidth: 0 },
  alertTitle: { color: "#4A3C1D", fontSize: 14, fontWeight: "800" },
  alertHint: { color: "#64736A", fontSize: 12, lineHeight: 18 },
  alertRefresh: { alignItems: "center", justifyContent: "center", minHeight: 40, minWidth: 70, paddingHorizontal: 8 },
  alertRefreshText: { color: "#215B43", fontSize: 12, fontWeight: "800" },
  alertError: { color: "#A75132", fontSize: 12, lineHeight: 18 },
  expiredText: { color: "#A03E35", fontSize: 12, lineHeight: 18 },
  nearExpiryText: { color: "#665221", fontSize: 12, lineHeight: 18 },
  itemActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  itemAction: { alignItems: "center", borderColor: "#DDE5DC", borderRadius: 6, borderWidth: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 36, paddingHorizontal: 8 },
  itemActionText: { color: "#215B43", fontSize: 11, fontWeight: "700" },
  deleteActionText: { color: "#A75132", fontSize: 11, fontWeight: "700" },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.42)", flex: 1, justifyContent: "center", padding: 16 },
  modalCard: { alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 12, gap: 12, maxHeight: "90%", padding: 16, width: "100%" },
  modalWide: { maxWidth: 560 },
  modalTitle: { color: "#17271F", fontSize: 18, fontWeight: "800" },
  modalForm: { gap: 8, paddingBottom: 8 },
  fieldLabel: { color: "#4A5E51", fontSize: 12, fontWeight: "700", marginTop: 4 },
  modalInput: { backgroundColor: "#FAFCF9", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, color: "#17271F", minHeight: 44, paddingHorizontal: 11 },
  choiceRail: { alignItems: "center", gap: 7, paddingVertical: 4 },
  choiceChip: { backgroundColor: "#EEF2ED", borderRadius: 16, justifyContent: "center", minHeight: 38, paddingHorizontal: 10 },
  choiceChipActive: { backgroundColor: "#215B43" },
  choiceText: { color: "#4A5E51", fontSize: 11, fontWeight: "600" },
  choiceTextActive: { color: "#FFFFFF", fontWeight: "800" },
  modalActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  cancelButtonText: { color: "#4A5E51", fontSize: 12, fontWeight: "700" },
  saveButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
