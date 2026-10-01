import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodItem } from "./types";

const API_BASE_URL = "http://localhost:4003";

const categories = ["All", "FRIDGE", "FREEZER", "PANTRY", "COUNTER"];

type Props = {
  onItemPress?: (item: FoodItem) => void;
};

export default function InventoryListScreen({
  onItemPress,
}: Props): React.JSX.Element {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const loadItems = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/inventory/items?limit=50`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
      } else {
        setError(data.error || "Không tải được dữ liệu");
      }
    } catch (err: any) {
      setError(err.message || "Không kết nối được API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SMARTKITCHEN / INVENTORY</Text>
        <Text style={styles.title}>Kho của bạn</Text>
        <Text style={styles.subtitle}>
          {items.length} nguyên liệu trong kho
        </Text>
        <View style={styles.searchBox}>
          <Text style={styles.searchMark}>Tìm</Text>
          <TextInput
            accessibilityLabel="Search inventory"
            onChangeText={setSearch}
            placeholder="Gạo, sữa, trứng..."
            placeholderTextColor="#77847C"
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} style={styles.clearButton}>
              <Text style={styles.clearText}>Xóa</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroller}
        contentContainerStyle={styles.categoryRail}
      >
        {categories.map((category) => {
          const active = category === activeCategory;
          return (
            <Pressable
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#215B43" />
          <Text style={styles.loadingText}>Đang tải kho...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Pressable onPress={loadItems} style={styles.retryBtn}>
            <Text style={styles.retryText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredItems}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Chưa có nguyên liệu nào.</Text>
          }
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {filteredItems.length} NGUYÊN LIỆU
            </Text>
          }
          renderItem={({ item, index }) => {
            const isNearExpiry = item.status === "NEAR_EXPIRY";
            const isExpired = item.status === "EXPIRED";
            return (
              <Pressable
                onPress={() => onItemPress?.(item)}
                style={styles.recipeRow}
              >
                <View style={styles.imageWrap}>
                  <View
                    style={[
                      styles.placeholderImage,
                      isExpired && { backgroundColor: "#F4C7C3" },
                      isNearExpiry && { backgroundColor: "#F3C875" },
                    ]}
                  >
                    <Text style={styles.placeholderEmoji}>📦</Text>
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
                  <Text style={styles.recipeTitle}>{item.name}</Text>
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
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F3F6F0", flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 18 },
  eyebrow: {
    color: "#547364",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#17271F",
    fontFamily: "Georgia",
    fontSize: 32,
    marginTop: 14,
  },
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
  searchMark: {
    color: "#A75132",
    fontSize: 11,
    fontWeight: "800",
    marginRight: 10,
    textTransform: "uppercase",
  },
  searchInput: { color: "#17271F", flex: 1, fontSize: 14, paddingVertical: 12 },
  clearButton: { padding: 8 },
  clearText: { color: "#27634B", fontSize: 12, fontWeight: "700" },
  categoryScroller: { flexGrow: 0, flexShrink: 0, height: 72 },
  categoryRail: { alignItems: "center", gap: 8, paddingHorizontal: 22 },
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
  listContent: { paddingBottom: 28, paddingHorizontal: 22 },
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
  placeholderEmoji: { fontSize: 42 },
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
    fontFamily: "Georgia",
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
    backgroundColor: "#215B43",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
