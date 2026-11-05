import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../services/session";
import { ShoppingItem, ShoppingList, ShoppingSuggestion, ShoppingUnit, shoppingApi } from "./shoppingApi";

const unitChoices: ShoppingUnit[] = ["PIECE", "PACK", "BOX", "BOTTLE", "CAN", "GRAM", "KILOGRAM", "MILLILITER", "LITER"];
const unitLabels: Record<ShoppingUnit, string> = {
  PIECE: "Cái", PACK: "Gói", BOX: "Hộp", BOTTLE: "Chai", CAN: "Lon",
  GRAM: "Gram", KILOGRAM: "Kg", MILLILITER: "Ml", LITER: "Lít",
};

export default function ShoppingCartScreen(): React.JSX.Element {
  const { family, accessToken, ready } = useSession();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [suggestions, setSuggestions] = useState<ShoppingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
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
      const [nextLists, nextSuggestions] = await Promise.all([
        shoppingApi.list(accessToken, family.id),
        shoppingApi.suggestions(accessToken, family.id).catch(() => []),
      ]);
      setLists(nextLists);
      setSuggestions(nextSuggestions);
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
          <Pressable disabled={busyItemId === item.id} onPress={() => confirmPurchase(item)} style={[styles.confirmButton, busyItemId === item.id && styles.disabled]}>
            {busyItemId === item.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmButtonText}>{item.isPurchased ? "Đồng bộ kho" : "Đã mua"}</Text>}
          </Pressable>
        )}
      </View>
    );
  };

  if (!ready || loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#215B43" /><Text style={styles.helper}>Đang tải danh sách...</Text></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SMARTKITCHEN / SHOPPING</Text>
          <Text style={styles.title}>Đi chợ</Text>
        </View>
        <Pressable onPress={() => void fetchData(true)} style={styles.refreshButton}><Text style={styles.refreshText}>Làm mới</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!family ? (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>Tạo hoặc tham gia gia đình để dùng danh sách đi chợ.</Text></View>
        ) : (
          <>
            <View style={styles.addCard}>
              <Text style={styles.sectionTitle}>Lưu món để tham khảo</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Ví dụ: Sữa tươi" style={styles.input} returnKeyType="done" />
              <View style={styles.quantityRow}>
                <TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={[styles.input, styles.quantityInput]} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitChoices}>
                  {unitChoices.map((choice) => (
                    <Pressable key={choice} onPress={() => setUnit(choice)} style={[styles.unitChip, unit === choice && styles.unitChipSelected]}>
                      <Text style={[styles.unitChipText, unit === choice && styles.unitChipTextSelected]}>{unitLabels[choice]}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <Pressable disabled={saving} onPress={() => void addItem()} style={[styles.addButton, saving && styles.disabled]}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addButtonText}>Lưu vào danh sách</Text>}
              </Pressable>
              <Text style={styles.helper}>Món chỉ nằm trong danh sách. Kho chỉ được cập nhật sau khi bạn xác nhận đã mua.</Text>
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestionBox}>
                <Text style={styles.sectionTitle}>Gợi ý từ các lần mua trước</Text>
                <View style={styles.suggestionList}>
                  {suggestions.map((suggestion) => (
                    <Pressable key={`${suggestion.name}-${suggestion.unit}`} onPress={() => { setName(suggestion.name); setUnit(suggestion.unit); }} style={styles.suggestionChip}>
                      <Text style={styles.suggestionText}>{suggestion.name} · {suggestion.count} lần</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable onPress={() => void fetchData(true)}><Text style={styles.retryText}>Thử tải lại</Text></Pressable></View>}
            {notice && <Text style={styles.notice}>{notice}</Text>}

            {lists.map((list) => (
              <View key={list.id} style={styles.listContainer}>
                <Text style={styles.listTitle}>{list.name}</Text>
                {list.items.length ? list.items.map(renderItem) : <Text style={styles.helper}>Chưa có món nào trong danh sách này.</Text>}
              </View>
            ))}
            {!lists.length && !error && <View style={styles.emptyBox}><Text style={styles.emptyText}>Chưa có món nào. Lưu một món ở trên để bắt đầu.</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F3F6F0", flex: 1 },
  header: { alignItems: "center", backgroundColor: "#FFFFFF", borderBottomColor: "#E5EBE3", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 15 },
  eyebrow: { color: "#547364", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#17271F", fontSize: 28, fontWeight: "800", marginTop: 4 },
  refreshButton: { backgroundColor: "#E9F1EB", borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: "#215B43", fontSize: 12, fontWeight: "800" },
  content: { gap: 14, padding: 16, paddingBottom: 30 },
  addCard: { backgroundColor: "#FFFFFF", borderColor: "#DDE5DC", borderRadius: 11, borderWidth: 1, gap: 10, padding: 15 },
  sectionTitle: { color: "#17271F", fontSize: 15, fontWeight: "800" },
  input: { backgroundColor: "#FAFCF9", borderColor: "#DDE5DC", borderRadius: 7, borderWidth: 1, color: "#17271F", minHeight: 44, paddingHorizontal: 11, paddingVertical: 9 },
  quantityRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  quantityInput: { minWidth: 68, width: 76 },
  unitChoices: { alignItems: "center", gap: 6 },
  unitChip: { backgroundColor: "#EEF2ED", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  unitChipSelected: { backgroundColor: "#D4E7D8" },
  unitChipText: { color: "#53655A", fontSize: 11, fontWeight: "600" },
  unitChipTextSelected: { color: "#215B43", fontWeight: "800" },
  addButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 43, paddingHorizontal: 12 },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  helper: { color: "#64736A", fontSize: 11, lineHeight: 17 },
  suggestionBox: { backgroundColor: "#FFF9E6", borderColor: "#F3C875", borderRadius: 11, borderWidth: 1, gap: 9, padding: 14 },
  suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  suggestionChip: { backgroundColor: "#FFFFFF", borderColor: "#F3C875", borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  suggestionText: { color: "#6C5730", fontSize: 11, fontWeight: "600" },
  listContainer: { gap: 8 },
  listTitle: { color: "#17271F", fontSize: 18, fontWeight: "800", marginBottom: 1 },
  itemCard: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#E5EBE3", borderRadius: 9, borderWidth: 1, flexDirection: "row", gap: 10, padding: 13 },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { color: "#26372D", fontSize: 15, fontWeight: "700" },
  itemMeta: { color: "#66736A", fontSize: 11 },
  statusText: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  statusSynced: { color: "#215B43" },
  statusNeedsSync: { color: "#A75132" },
  statusReference: { color: "#68766D" },
  confirmButton: { alignItems: "center", backgroundColor: "#215B43", borderRadius: 7, justifyContent: "center", minHeight: 37, minWidth: 74, paddingHorizontal: 9 },
  confirmButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  emptyBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 9, padding: 20 },
  emptyText: { color: "#64736A", fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorBox: { backgroundColor: "#FFF1EF", borderRadius: 8, gap: 7, padding: 12 },
  errorText: { color: "#A75132", fontSize: 12, lineHeight: 17 },
  retryText: { color: "#215B43", fontSize: 11, fontWeight: "800" },
  notice: { backgroundColor: "#E9F1EB", borderRadius: 8, color: "#215B43", fontSize: 12, lineHeight: 18, padding: 11 },
  center: { alignItems: "center", backgroundColor: "#F3F6F0", flex: 1, gap: 12, justifyContent: "center", padding: 32 },
});
