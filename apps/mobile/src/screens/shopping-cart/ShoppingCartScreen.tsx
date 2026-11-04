import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";

const API_URL = "http://localhost:4008/api/shopping-list";
const FAMILY_ID = "11111111-1111-1111-1111-111111111111";

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  isPurchased: boolean;
  note?: string;
}

interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingItem[];
}

interface Suggestion {
  name: string;
  count: number;
  unit: string;
}

export default function ShoppingCartScreen() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Lấy danh sách đi chợ chính
      const resLists = await axios.get(`${API_URL}?familyId=${FAMILY_ID}`);
      setLists(resLists.data.lists || []);

      // 2. Lấy gợi ý mua sắm (bọc try-catch riêng để tránh lỗi nếu endpoint chưa sẵn sàng)
      try {
        const resSuggestions = await axios.get(
          `${API_URL}/suggestions?familyId=${FAMILY_ID}`,
        );
        setSuggestions(resSuggestions.data.data || []);
      } catch (suggestionErr) {
        console.log("Suggestions API not available yet:", suggestionErr);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Lỗi", "Không thể tải dữ liệu danh sách đi chợ");
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (item: ShoppingItem) => {
    try {
      // Cập nhật trạng thái item qua API
      await axios.patch(`${API_URL}/items/${item.id}/purchase`, {
        isPurchased: !item.isPurchased,
      });
      fetchData(); // Tải lại dữ liệu
    } catch (err) {
      Alert.alert("Lỗi", "Không thể cập nhật trạng thái món hàng");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const renderItem = (item: ShoppingItem) => (
    <TouchableOpacity
      key={item.id}
      style={styles.itemRow}
      onPress={() => toggleItem(item)}
    >
      <View
        style={[styles.checkbox, item.isPurchased && styles.checkboxChecked]}
      >
        {item.isPurchased && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.itemInfo}>
        <Text
          style={[
            styles.itemName,
            item.isPurchased && styles.textStrikethrough,
          ]}
        >
          {item.name}
        </Text>
        <Text style={styles.itemMeta}>
          {item.quantity} {item.unit} {item.note ? `• ${item.note}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛒 Đi chợ</Text>
        <TouchableOpacity onPress={fetchData} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Làm mới</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {/* HIỂN THỊ GỢI Ý - SCRUM-193 */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            <Text style={styles.suggestionTitle}>
              💡 Gợi ý mua sắm (Dựa trên thói quen)
            </Text>
            <View style={styles.suggestionList}>
              {suggestions.map((s, idx) => (
                <View key={idx} style={styles.suggestionChip}>
                  <Text style={styles.suggestionText}>
                    {s.name} (x{s.count})
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* HIỂN THỊ DANH SÁCH ĐI CHỢ */}
        {lists.map((list) => (
          <View key={list.id} style={styles.listContainer}>
            <Text style={styles.listTitle}>{list.name}</Text>
            {list.items.map((item) => renderItem(item))}
          </View>
        ))}

        {lists.length === 0 && (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              Chưa có danh sách nào. Hãy tạo từ kho!
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F6F0" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#17271F" },
  refreshBtn: { padding: 8, backgroundColor: "#007AFF", borderRadius: 6 },
  refreshText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  listContent: { padding: 16 },
  suggestionBox: {
    backgroundColor: "#FFF9E6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#F3C875",
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#A75132",
    marginBottom: 10,
  },
  suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3C875",
  },
  suggestionText: { fontSize: 13, color: "#333", fontWeight: "500" },
  listContainer: { marginBottom: 24 },
  listTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#17271F",
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5EBE3",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: "#007AFF" },
  checkmark: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "600", color: "#333" },
  textStrikethrough: { textDecorationLine: "line-through", color: "#999" },
  itemMeta: { fontSize: 13, color: "#666", marginTop: 4 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 40,
  },
  emptyText: { color: "#999", fontSize: 15, textAlign: "center" },
});
