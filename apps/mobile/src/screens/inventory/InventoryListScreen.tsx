import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodItem } from "./types";
import { useSession } from "../../services/session";
import { inventoryApi } from "./inventoryApi";
import InventoryCapturePanel from "./InventoryCapturePanel";

const categories = ["All", "FRIDGE", "FREEZER", "PANTRY", "COUNTER"];

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}>
        <Text style={styles.eyebrow}>SMARTKITCHEN / INVENTORY</Text>
        <Text style={[styles.title, isCompact && styles.compactTitle]}>Kho của bạn</Text>
        <Text style={styles.subtitle}>
          {items.length} nguyên liệu trong kho
        </Text>
        <View style={styles.searchBox}>
          <Text style={styles.searchMark}>Tìm</Text>
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
              <Text style={styles.clearText}>Xóa</Text>
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
              <Pressable
                accessibilityRole={onItemPress ? "button" : undefined}
                accessibilityLabel={`${item.name}, ${item.quantity} ${item.unit}, ${item.status}`}
                disabled={!onItemPress}
                key={item.id}
                onPress={() => onItemPress?.(item)}
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
            })}
          </>
        )}
      </ScrollView>
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
  searchMark: {
    color: "#A75132",
    fontSize: 11,
    fontWeight: "800",
    marginRight: 10,
    textTransform: "uppercase",
  },
  searchInput: { color: "#17271F", flex: 1, fontSize: 14, paddingVertical: 12 },
  clearButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  clearText: { color: "#27634B", fontSize: 12, fontWeight: "700" },
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
});
