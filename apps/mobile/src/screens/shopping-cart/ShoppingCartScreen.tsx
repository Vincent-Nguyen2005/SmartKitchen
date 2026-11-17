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
import { AppIcon, colors, fontFamily, spacing, textStyles, touchTarget, typography } from "../../theme";
import { RadioDropdown } from "../../components/RadioDropdown";
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
            {busyItemId === item.id ? <ActivityIndicator size="small" color={colors.surface} /> : <View style={styles.inlineAction}><AppIcon icon={Check} size="sm" color={colors.surface} /><Text style={styles.confirmButtonText}>{item.isPurchased ? "Đồng bộ kho" : "Đã mua"}</Text></View>}
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
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.helper}>Đang tải danh sách...</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: isCompact ? spacing.md : isWide ? spacing.xl : spacing.xl }, isWide && styles.wideContent]}>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Đi chợ</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới danh sách đi chợ" onPress={() => void fetchData(true)} style={styles.refreshButton}>
          <View style={styles.inlineAction}><AppIcon icon={RefreshCw} size="sm" color={colors.primary} /><Text style={styles.refreshText}>Làm mới</Text></View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { padding: isCompact ? spacing.md : spacing.lg }, isWide && styles.wideContent]} keyboardShouldPersistTaps="handled">
        {!family ? (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>Tạo hoặc tham gia gia đình để dùng danh sách đi chợ.</Text></View>
        ) : (
          <>
            <View style={styles.addCard}>
              <Text style={styles.sectionTitle}>Lưu món để tham khảo</Text>
              <TextInput accessibilityLabel="Tên món cần mua" value={name} onChangeText={setName} placeholder="Ví dụ: Sữa tươi" style={styles.input} returnKeyType="done" />
              <View style={styles.quantityRow}>
                <TextInput accessibilityLabel="Số lượng cần mua" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                <RadioDropdown<ShoppingUnit>
                  label="Đơn vị"
                  value={unit}
                  options={unitChoices.map((choice) => ({ value: choice, label: unitLabels[choice] }))}
                  onChange={setUnit}
                  searchable
                  searchPlaceholder="Tìm đơn vị (kg, hộp...)"
                />
              </View>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void addItem()} style={[styles.addButton, saving && styles.disabled]}>
                {saving ? <ActivityIndicator color={colors.surface} /> : <View style={styles.inlineAction}><AppIcon icon={Plus} size="sm" color={colors.surface} /><Text style={styles.addButtonText}>Lưu vào danh sách</Text></View>}
              </Pressable>
              <Text style={styles.helper}>Món chỉ nằm trong danh sách. Kho chỉ được cập nhật sau khi bạn xác nhận đã mua.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ busy: generating, disabled: generating }} disabled={generating} onPress={() => void generateFromMenu()} style={[styles.generateButton, generating && styles.disabled]}>
                {generating ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.generateButtonText}>Tạo danh sách từ thực đơn hiện tại</Text>}
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
            <Text style={styles.modalTitle}>Sửa {editingItem?.name}</Text>
            <Text style={styles.helper}>Đơn vị: {editingItem ? unitLabels[editingItem.unit] : ""}</Text>
            <TextInput accessibilityLabel="Số lượng cần mua" value={editQuantity} onChangeText={setEditQuantity} keyboardType="decimal-pad" style={styles.input} />
            <TextInput accessibilityLabel="Ghi chú món cần mua" value={editNote} onChangeText={setEditNote} placeholder="Ghi chú (không bắt buộc)" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={busyItemId !== null} onPress={() => setEditingItem(null)} style={styles.cancelButton}><Text style={styles.retryText}>Hủy</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busyItemId !== null} onPress={() => void saveEditedItem()} style={[styles.addButton, busyItemId !== null && styles.disabled]}>{busyItemId === editingItem?.id ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.addButtonText}>Lưu thay đổi</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  wideContent: { alignSelf: "center", maxWidth: 900, width: "100%" },
  header: { alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingVertical: spacing.lg, width: "100%" },
  headerTitle: { flex: 1, minWidth: 0 },
  title: { ...textStyles.pageTitle, color: colors.text },
  refreshButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 7, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  inlineAction: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  refreshText: { color: colors.primary, ...typography.labelSmall },
  content: { alignSelf: "center", gap: spacing.lg, paddingBottom: spacing.xl, width: "100%" },
  addCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 11, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionTitle: { ...textStyles.subheading, color: colors.text },
  modalTitle: { ...textStyles.heading, color: colors.text },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 7, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  quantityInput: { minWidth: 68, width: 76 },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  addButtonText: { color: colors.surface, ...typography.label },
  helper: { color: colors.muted, ...typography.bodySmall },
  suggestionBox: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: 11, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggestionChip: { backgroundColor: colors.surface, borderColor: colors.warning, borderRadius: 16, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  suggestionText: { color: colors.warning, ...typography.labelSmall },
  suggestionMeta: { color: colors.muted, ...typography.caption, marginTop: spacing.xs },
  listContainer: { gap: spacing.sm },
  listHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  listTitle: { color: colors.text, ...typography.subheading, marginBottom: spacing.xs },
  completeButton: { alignItems: "center", borderColor: colors.primary, borderRadius: 6, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  completeButtonText: { color: colors.primary, ...typography.labelSmall },
  itemCard: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  itemActions: { alignItems: "center", gap: spacing.xs, justifyContent: "center" },
  smallAction: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.xs },
  smallActionText: { color: colors.primary, ...typography.labelSmall },
  deleteActionText: { color: colors.danger, ...typography.labelSmall },
  itemInfo: { flex: 1, gap: spacing.xs, minWidth: 0 },
  itemName: { color: colors.text, ...typography.label },
  itemMeta: { color: colors.muted, flexShrink: 1, ...typography.bodySmall },
  statusText: { flexShrink: 1, ...typography.caption, marginTop: spacing.xs },
  statusSynced: { color: colors.primary },
  statusNeedsSync: { color: colors.danger },
  statusReference: { color: colors.muted },
  confirmButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 7, justifyContent: "center", minHeight: 44, minWidth: 74, paddingHorizontal: spacing.md },
  confirmButtonText: { color: colors.surface, ...typography.labelSmall },
  disabled: { opacity: 0.6 },
  emptyBox: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 9, padding: spacing.xl },
  emptyText: { color: colors.muted, ...typography.body, textAlign: "center" },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: 8, gap: spacing.sm, padding: spacing.md },
  errorText: { color: colors.danger, ...typography.bodySmall },
  retryButton: { alignSelf: "flex-start", minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.xs },
  retryText: { color: colors.primary, ...typography.labelSmall },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 8, color: colors.primary, ...typography.bodySmall, padding: spacing.md },
  generateButton: { alignItems: "center", borderColor: colors.primary, borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md },
  generateButtonText: { color: colors.primary, ...typography.labelSmall, textAlign: "center" },
  modalBackdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  modalCard: { alignSelf: "center", backgroundColor: colors.surface, borderRadius: 12, gap: spacing.md, maxWidth: 480, padding: spacing.lg, width: "100%" },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  cancelButton: { alignItems: "center", borderColor: colors.border, borderRadius: 7, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.lg },
  center: { alignItems: "center", backgroundColor: colors.background, flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
});
