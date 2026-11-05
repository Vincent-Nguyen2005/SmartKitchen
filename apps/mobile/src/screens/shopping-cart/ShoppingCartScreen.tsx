import React, { useEffect, useState } from "react";
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
import { Check, Plus, RefreshCw } from "lucide-react-native";
import { useSession } from "../../services/session";
import { ShoppingItem, ShoppingList, ShoppingSuggestion, ShoppingUnit, shoppingApi } from "./shoppingApi";

const unitChoices: ShoppingUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const unitLabels: Record<ShoppingUnit, string> = {
  PIECE: "Cái", PACK: "Gói", BOX: "Hộp", BOTTLE: "Chai", CAN: "Lon",
  GRAM: "Gram", KILOGRAM: "Kg", MILLILITER: "Ml", LITER: "Lít",
};

export default function ShoppingCartScreen(): React.JSX.Element {
  const { family, accessToken, ready } = useSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [completingListId, setCompletingListId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editNote, setEditNote] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<ShoppingUnit>("PIECE");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchData = async (showLoading = false) => {
    if (!ready) return;
    if (!family?.id || !accessToken) {
      setLists([]);
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [listsResult, suggestionsResult] = await Promise.allSettled([
        shoppingApi.list(accessToken, family.id),
        shoppingApi.suggestions(accessToken, family.id),
      ]);
      if (listsResult.status === "rejected") throw listsResult.reason;
      const nextLists = listsResult.value;
      const nextSuggestions = suggestionsResult.status === "fulfilled" ? suggestionsResult.value : [];
      setLists(nextLists);
      setSuggestions(nextSuggestions);
      setSuggestionError(suggestionsResult.status === "rejected"
        ? (suggestionsResult.reason instanceof Error ? suggestionsResult.reason.message : "Không tải được gợi ý tiêu thụ.")
        : null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải danh sách đi chợ.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(true); }, [family?.id, accessToken, ready]);

  const addItem = async () => {
    if (!family?.id || !accessToken) { setError("Đăng nhập và tạo hoặc tham gia gia đình trước."); return; }
    const itemName = name.trim();
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!itemName) { setError("Nhập tên món cần mua."); return; }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) { setError("Số lượng phải lớn hơn 0."); return; }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await shoppingApi.addItem(accessToken, { familyId: family.id, name: itemName, quantity: parsedQuantity, unit });
      setName("");
      setQuantity("1");
      setNotice("Đã lưu vào danh sách để tham khảo. Kho chưa thay đổi cho đến khi bạn xác nhận đã mua.");
      await fetchData(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không lưu được món vào danh sách.");
    } finally {
      setSaving(false);
    }
  };

  const confirmPurchase = (item: ShoppingItem) => {
    if (!family?.id || !accessToken) return;
    const actionLabel = item.isPurchased ? "Đồng bộ vào kho" : "Đã mua và thêm vào kho";
    Alert.alert(
      "Xác nhận mua",
      `Thêm ${item.quantity} ${unitLabels[item.unit]} ${item.name} vào kho của gia đình?`,
      [
        { text: "Để sau", style: "cancel" },
        {
          text: actionLabel,
          onPress: () => {
            void (async () => {
              setBusyItemId(item.id);
              setError(null);
              setNotice(null);
              try {
                const result = await shoppingApi.confirmPurchase(accessToken, family.id, item.id);
                setLists((current) => current.map((list) => ({
                  ...list,
                  items: list.items.map((currentItem) => currentItem.id === item.id ? result.item : currentItem),
                })));
                setNotice(result.alreadyApplied
                  ? "Món này đã được đồng bộ vào kho trước đó; số lượng không bị cộng lại."
                  : "Đã xác nhận mua và cập nhật số lượng trong kho.");
                await fetchData(false);
              } catch (requestError) {
                setError(requestError instanceof Error ? requestError.message : "Chưa cập nhật được kho. Món vẫn có thể thử lại.");
              } finally {
                setBusyItemId(null);
              }
            })();
          },
        },
      ],
    );
  };

  const generateFromMenu = async () => {
    if (!family?.id || !accessToken) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await shoppingApi.generateFromMenu(accessToken, family.id);
      setNotice(result.message || `Đã tạo ${result.items.length} món cần mua từ thực đơn.`);
      await fetchData(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo danh sách từ thực đơn.");
    } finally {
      setGenerating(false);
    }
  };

  const openEditItem = (item: ShoppingItem) => {
    setEditingItem(item);
    setEditQuantity(String(item.quantity));
    setEditNote(item.note ?? "");
  };

  const saveEditedItem = async () => {
    if (!editingItem || !family?.id || !accessToken) return;
    const parsedQuantity = Number(editQuantity.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Số lượng phải là số lớn hơn 0.");
      return;
    }
    setBusyItemId(editingItem.id);
    setError(null);
    try {
      await shoppingApi.updateItem(accessToken, family.id, editingItem.id, {
        quantity: parsedQuantity,
        note: editNote.trim() || null,
      });
      setEditingItem(null);
      await fetchData(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể cập nhật món.");
    } finally {
      setBusyItemId(null);
    }
  };

  const deleteItem = (item: ShoppingItem) => {
    if (!family?.id || !accessToken) return;
    Alert.alert("Xóa món khỏi danh sách", `Bạn muốn xóa ${item.name}?`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyItemId(item.id);
            setError(null);
            try {
              await shoppingApi.deleteItem(accessToken, family.id, item.id);
              await fetchData(false);
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : "Không thể xóa món.");
            } finally {
              setBusyItemId(null);
            }
          })();
        },
      },
    ]);
  };

  const completeList = (list: ShoppingList) => {
    if (!family?.id || !accessToken) return;
    const unsyncedPurchases = list.items.filter((item) => item.isPurchased && !item.inventoryAppliedAt).length;
    const detail = unsyncedPurchases
      ? ` Có ${unsyncedPurchases} món đã đánh dấu mua nhưng chưa đồng bộ kho; hoàn tất sẽ không tự đồng bộ chúng.`
      : " Danh sách sẽ được lưu thành đã hoàn tất.";
    Alert.alert("Hoàn tất danh sách?", `Thao tác này sẽ đóng danh sách đi chợ.${detail}`, [
      { text: "Để sau", style: "cancel" },
      {
        text: "Hoàn tất",
        onPress: () => {
          void (async () => {
            setCompletingListId(list.id);
            setError(null);
            try {
              await shoppingApi.completeList(accessToken, family.id, list.id);
              await fetchData(false);
              setNotice("Đã hoàn tất danh sách đi chợ.");
            } catch (requestError) {
              setError(requestError instanceof Error ? requestError.message : "Không thể hoàn tất danh sách.");
            } finally {
              setCompletingListId(null);
            }
          })();
        },
      },
    ]);
  };

  const renderItem = (item: ShoppingItem) => {
    const isSynced = Boolean(item.inventoryAppliedAt);
    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>{item.quantity} {unitLabels[item.unit]}{item.note ? ` • ${item.note}` : ""}</Text>
          <Text style={[styles.statusText, isSynced ? styles.statusSynced : item.isPurchased ? styles.statusNeedsSync : styles.statusReference]}>
            {isSynced ? "Đã mua • Đã thêm vào kho" : item.isPurchased ? "Đã mua • Chưa xác nhận cập nhật kho" : "Để tham khảo • Chưa thêm vào kho"}
          </Text>
        </View>
        {!isSynced && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.isPurchased ? `Đồng bộ ${item.name} vào kho` : `Xác nhận đã mua ${item.name}`}
            accessibilityState={{ busy: busyItemId === item.id, disabled: busyItemId === item.id }}
            disabled={busyItemId === item.id}
            onPress={() => confirmPurchase(item)}
            style={[styles.confirmButton, busyItemId === item.id && styles.disabled]}
          >
            {busyItemId === item.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <View style={styles.inlineAction}><Check color="#FFFFFF" size={14} /><Text style={styles.confirmButtonText}>{item.isPurchased ? "Đồng bộ kho" : "Đã mua"}</Text></View>}
          </Pressable>
        )}
        {!item.isPurchased && (
          <View style={styles.itemActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sửa ${item.name}`} disabled={busyItemId === item.id} onPress={() => openEditItem(item)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Sửa</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${item.name}`} disabled={busyItemId === item.id} onPress={() => deleteItem(item)} style={styles.smallAction}>
              <Text style={styles.deleteActionText}>Xóa</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (!ready || loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#215B43" /><Text style={styles.helper}>Đang tải danh sách...</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: isCompact ? 14 : isWide ? 32 : 20 }, isWide && styles.wideContent]}>
        <View style={styles.headerTitle}>
          <Text style={styles.eyebrow}>SMARTKITCHEN / SHOPPING</Text>
          <Text style={styles.title}>Đi chợ</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới danh sách đi chợ" onPress={() => void fetchData(true)} style={styles.refreshButton}>
          <View style={styles.inlineAction}><RefreshCw color="#215B43" size={14} /><Text style={styles.refreshText}>Làm mới</Text></View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { padding: isCompact ? 12 : 16 }, isWide && styles.wideContent]} keyboardShouldPersistTaps="handled">
        {!family ? (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>Tạo hoặc tham gia gia đình để dùng danh sách đi chợ.</Text></View>
        ) : (
          <>
            <View style={styles.addCard}>
              <Text style={styles.sectionTitle}>Lưu món để tham khảo</Text>
              <TextInput accessibilityLabel="Tên món cần mua" value={name} onChangeText={setName} placeholder="Ví dụ: Sữa tươi" style={styles.input} returnKeyType="done" />
              <View style={styles.quantityRow}>
                <TextInput accessibilityLabel="Số lượng cần mua" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                <ScrollView style={styles.unitPicker} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitChoices}>
                  {unitChoices.map((choice) => (
                    <Pressable accessibilityRole="button" accessibilityState={{ selected: unit === choice }} accessibilityLabel={`Đơn vị ${unitLabels[choice]}`} key={choice} onPress={() => setUnit(choice)} style={[styles.unitChip, unit === choice && styles.unitChipSelected]}>
                      <Text style={[styles.unitChipText, unit === choice && styles.unitChipTextSelected]}>{unitLabels[choice]}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void addItem()} style={[styles.addButton, saving && styles.disabled]}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.inlineAction}><Plus color="#FFFFFF" size={16} /><Text style={styles.addButtonText}>Lưu vào danh sách</Text></View>}
              </Pressable>
              <Text style={styles.helper}>Món chỉ nằm trong danh sách. Kho chỉ được cập nhật sau khi bạn xác nhận đã mua.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: generating, disabled: generating }} disabled={generating} onPress={() => void generateFromMenu()} style={[styles.generateButton, generating && styles.disabled]}>
                {generating ? <ActivityIndicator color="#215B43" /> : <Text style={styles.generateButtonText}>Tạo danh sách từ thực đơn hiện tại</Text>}
              </Pressable>
            </View>

            {(suggestionError || suggestions.length > 0) && (
              <View style={styles.suggestionBox}>
                <Text style={styles.sectionTitle}>Gợi ý theo lượng đã dùng</Text>
                {suggestionError ? <View><Text style={styles.errorText}>{suggestionError}</Text><Pressable accessibilityRole="button" onPress={() => void fetchData(true)} style={styles.retryButton}><Text style={styles.retryText}>Tải lại gợi ý</Text></Pressable></View> : (
                  <View style={styles.suggestionList}>
                    {suggestions.map((suggestion) => (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Thêm gợi ý ${suggestion.name}, đề xuất ${suggestion.suggestedQuantity} ${unitLabels[suggestion.unit]}`} key={`${suggestion.name}-${suggestion.unit}`} onPress={() => { setName(suggestion.name); setQuantity(String(suggestion.suggestedQuantity)); setUnit(suggestion.unit); }} style={styles.suggestionChip}>
                        <Text style={styles.suggestionText}>{suggestion.name} · đề xuất {suggestion.suggestedQuantity} {unitLabels[suggestion.unit]}</Text>
                        <Text style={styles.suggestionMeta}>Dùng {suggestion.consumedQuantity} {unitLabels[suggestion.unit]} / {suggestion.historyDays} ngày · tồn {suggestion.availableQuantity}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {error && <View style={styles.errorBox}><Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void fetchData(true)} style={styles.retryButton}><Text style={styles.retryText}>Thử tải lại</Text></Pressable></View>}
            {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}

            {lists.map((list) => (
              <View key={list.id} style={styles.listContainer}>
                <View style={styles.listHeading}>
                  <Text style={styles.listTitle}>{list.name}</Text>
                  {list.status === "ACTIVE" && <Pressable accessibilityRole="button" accessibilityState={{ busy: completingListId === list.id }} disabled={completingListId === list.id} onPress={() => completeList(list)} style={styles.completeButton}><Text style={styles.completeButtonText}>{completingListId === list.id ? "Đang lưu..." : "Hoàn tất"}</Text></Pressable>}
                </View>
                {list.items.length ? list.items.map(renderItem) : <Text style={styles.helper}>Chưa có món nào trong danh sách này.</Text>}
              </View>
            ))}
            {!lists.length && !error && <View style={styles.emptyBox}><Text style={styles.emptyText}>Chưa có món nào. Lưu một món ở trên để bắt đầu.</Text></View>}
          </>
        )}
      </ScrollView>
      <Modal animationType="slide" onRequestClose={() => { if (!busyItemId) setEditingItem(null); }} transparent visible={editingItem !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Sửa {editingItem?.name}</Text>
            <Text style={styles.helper}>Đơn vị: {editingItem ? unitLabels[editingItem.unit] : ""}</Text>
            <TextInput accessibilityLabel="Số lượng cần mua" value={editQuantity} onChangeText={setEditQuantity} keyboardType="decimal-pad" style={styles.input} />
            <TextInput accessibilityLabel="Ghi chú món cần mua" value={editNote} onChangeText={setEditNote} placeholder="Ghi chú (không bắt buộc)" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={busyItemId !== null} onPress={() => setEditingItem(null)} style={styles.cancelButton}><Text style={styles.retryText}>Hủy</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busyItemId !== null} onPress={() => void saveEditedItem()} style={[styles.addButton, busyItemId !== null && styles.disabled]}>{busyItemId === editingItem?.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addButtonText}>Lưu thay đổi</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F3F6F0", flex: 1 },
  wideContent: { alignSelf: "center", maxWidth: 900, width: "100%" },
  header: { alignItems: "center", alignSelf: "center", backgroundColor: "#FFFFFF", borderBottomColor: "#E5EBE3", borderBottomWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", paddingVertical: 15, width: "100%" },
  headerTitle: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#547364", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#17271F", fontSize: 28, fontWeight: "800", marginTop: 4 },
  refreshButton: { backgroundColor: "#E9F1EB", borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  inlineAction: { alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" },
  refreshText: { color: "#215B43", fontSize: 12, fontWeight: "800" },
  content: { alignSelf: "center", gap: 14, paddingBottom: 30, width: "100%" },
  addCard: { backgroundColor: "#FFFFFF", borderColor: "#DDE5DC", borderRadius: 11, borderWidth: 1, gap: 10, padding: 15 },
  sectionTitle: { color: "#17271F", fontSize: 15, fontWeight: "800" },
  input: { backgroundColor: "#FAFCF9", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, color: "#17271F", minHeight: 44, paddingHorizontal: 11, paddingVertical: 9 },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  unitPicker: { flex: 1, minWidth: 0 },
  quantityInput: { minWidth: 68, width: 76 },
  unitChoices: { alignItems: "center", gap: 6 },
  unitChip: { backgroundColor: "#EEF2ED", borderRadius: 16, justifyContent: "center", minHeight: 40, paddingHorizontal: 10 },
  unitChipSelected: { backgroundColor: "#D4E7D8" },
  unitChipText: { color: "#53655A", fontSize: 11, fontWeight: "600" },
  unitChipTextSelected: { color: "#215B43", fontWeight: "800" },
  addButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 43, paddingHorizontal: 12 },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  helper: { color: "#64736A", fontSize: 11, lineHeight: 17 },
  suggestionBox: { backgroundColor: "#FFF9E6", borderColor: "#F3C875", borderRadius: 11, borderWidth: 1, gap: 9, padding: 14 },
  suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  suggestionChip: { backgroundColor: "#FFFFFF", borderColor: "#F3C875", borderRadius: 16, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 10, paddingVertical: 7 },
  suggestionText: { color: "#6C5730", fontSize: 11, fontWeight: "600" },
  suggestionMeta: { color: "#756744", fontSize: 10, marginTop: 4 },
  listContainer: { gap: 8 },
  listHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  listTitle: { color: "#17271F", fontSize: 18, fontWeight: "800", marginBottom: 1 },
  completeButton: { alignItems: "center", borderColor: "#215B43", borderRadius: 6, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: 11 },
  completeButtonText: { color: "#215B43", fontSize: 11, fontWeight: "800" },
  itemCard: { alignItems: "flex-start", backgroundColor: "#FFFFFF", borderColor: "#E5EBE3", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 },
  itemActions: { alignItems: "center", gap: 2, justifyContent: "center" },
  smallAction: { alignItems: "center", justifyContent: "center", minHeight: 36, minWidth: 42, paddingHorizontal: 4 },
  smallActionText: { color: "#215B43", fontSize: 10, fontWeight: "800" },
  deleteActionText: { color: "#A75132", fontSize: 10, fontWeight: "800" },
  itemInfo: { flex: 1, gap: 4, minWidth: 0 },
  itemName: { color: "#26372D", fontSize: 15, fontWeight: "700" },
  itemMeta: { color: "#66736A", flexShrink: 1, fontSize: 11 },
  statusText: { flexShrink: 1, fontSize: 10, fontWeight: "700", marginTop: 2 },
  statusSynced: { color: "#215B43" },
  statusNeedsSync: { color: "#A75132" },
  statusReference: { color: "#68766D" },
  confirmButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 44, minWidth: 74, paddingHorizontal: 9 },
  confirmButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  emptyBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 9, padding: 20 },
  emptyText: { color: "#64736A", fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorBox: { backgroundColor: "#FFF1EF", borderRadius: 8, gap: 7, padding: 12 },
  errorText: { color: "#A75132", fontSize: 12, lineHeight: 17 },
  retryButton: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  retryText: { color: "#215B43", fontSize: 12, fontWeight: "800" },
  notice: { backgroundColor: "#E9F1EB", borderRadius: 8, color: "#215B43", fontSize: 12, lineHeight: 18, padding: 11 },
  generateButton: { alignItems: "center", borderColor: "#215B43", borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  generateButtonText: { color: "#215B43", fontSize: 12, fontWeight: "800", textAlign: "center" },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.42)", flex: 1, justifyContent: "center", padding: 16 },
  modalCard: { alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: 12, gap: 12, maxWidth: 480, padding: 16, width: "100%" },
  modalActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  center: { alignItems: "center", backgroundColor: "#F3F6F0", flex: 1, gap: 12, justifyContent: "center", padding: 32 },
});
