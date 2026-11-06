import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  createSuggestionsApi,
  PersonalizedSuggestions,
  SuggestionsApiError,
} from "./suggestionsApi";

type Props = { apiBaseUrl: string; userId: string };

function format(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function SuggestionsScreen({
  apiBaseUrl,
  userId,
}: Props): React.JSX.Element {
  const [result, setResult] = useState<PersonalizedSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (refresh = false): Promise<void> => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        setResult(await createSuggestionsApi(apiBaseUrl, userId).get());
      } catch (requestError) {
        if (
          requestError instanceof SuggestionsApiError &&
          requestError.status === 404
        ) {
          setError("Hãy tạo hồ sơ dinh dưỡng để nhận gợi ý cá nhân hóa.");
        } else {
          setError("Không thể tải gợi ý món ăn. Vui lòng thử lại.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiBaseUrl, userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={["#28735D"]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor="#28735D"
          />
        }
      >
        <Text style={styles.eyebrow}>DÀNH RIÊNG CHO BẠN</Text>
        <Text style={styles.title}>Gợi ý món ăn</Text>
        <Text style={styles.subtitle}>
          Món có metadata dị ứng hoặc chống chỉ định trùng với hồ sơ sức khỏe sẽ
          được loại khỏi danh sách.
        </Text>

        {loading ? (
          <ActivityIndicator color="#28735D" size="large" style={styles.loader} />
        ) : error ? (
          <View style={styles.empty}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : result ? (
          <>
            <View style={styles.goalCard}>
              <Text style={styles.goalTitle}>MỤC TIÊU THAM KHẢO / BỮA</Text>
              <Text style={styles.goalText}>
                {format(result.targetPerMeal.calories)} kcal · Đạm {format(result.targetPerMeal.protein)}g ·
                {" "}Carbs {format(result.targetPerMeal.carbs)}g · Béo {format(result.targetPerMeal.fat)}g
              </Text>
            </View>
            {result.suggestions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Chưa có món phù hợp</Text>
                <Text style={styles.emptyCopy}>
                  Catalog hiện chưa có món ăn hoặc tất cả món đã bị loại bởi metadata sức khỏe.
                </Text>
              </View>
            ) : (
              result.suggestions.map((recipe) => (
                <View key={recipe.id} style={styles.recipeCard}>
                  <View style={styles.recipeHeading}>
                    <Text style={styles.recipeName}>{recipe.name}</Text>
                    <Text style={styles.score}>{recipe.nutritionScore}%</Text>
                  </View>
                  {recipe.description ? (
                    <Text style={styles.description}>{recipe.description}</Text>
                  ) : null}
                  <Text style={styles.macros}>
                    {format(recipe.calories)} kcal · Đạm {format(recipe.protein)}g ·
                    {" "}Carbs {format(recipe.carbs)}g · Béo {format(recipe.fat)}g
                  </Text>
                  {recipe.ingredients.length > 0 ? (
                    <Text style={styles.detail}>
                      Nguyên liệu: {recipe.ingredients.join(", ")}
                    </Text>
                  ) : null}
                  <Text style={styles.scoreCaption}>Mức độ phù hợp dinh dưỡng ước tính</Text>
                </View>
              ))
            )}
            <Text style={styles.disclaimer}>
              Gợi ý dựa trên metadata món ăn và hồ sơ bạn cung cấp; không thay thế tư vấn y tế.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F4F7F2", flex: 1 },
  content: { padding: 22, paddingBottom: 36 },
  eyebrow: { color: "#28735D", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 8 },
  title: { color: "#182A24", fontSize: 28, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#65746C", fontSize: 14, lineHeight: 21, marginTop: 7 },
  goalCard: { backgroundColor: "#183D32", borderRadius: 11, marginTop: 18, padding: 15 },
  goalTitle: { color: "#C1D8CB", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  goalText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", lineHeight: 20, marginTop: 8 },
  recipeCard: { backgroundColor: "#FFFFFF", borderColor: "#E0E6E0", borderRadius: 11, borderWidth: 1, marginTop: 12, padding: 16 },
  recipeHeading: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  recipeName: { color: "#182A24", flex: 1, fontSize: 17, fontWeight: "800" },
  score: { backgroundColor: "#E8F2EC", borderRadius: 7, color: "#28735D", fontSize: 13, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  description: { color: "#65746C", fontSize: 13, lineHeight: 19, marginTop: 8 },
  macros: { color: "#35463E", fontSize: 12, fontWeight: "700", lineHeight: 19, marginTop: 10 },
  detail: { color: "#65746C", fontSize: 12, lineHeight: 18, marginTop: 8 },
  scoreCaption: { color: "#738078", fontSize: 11, marginTop: 8 },
  disclaimer: { color: "#738078", fontSize: 11, lineHeight: 17, marginTop: 16 },
  loader: { marginTop: 60 },
  empty: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 10, marginTop: 20, padding: 20 },
  emptyTitle: { color: "#182A24", fontSize: 16, fontWeight: "800" },
  emptyCopy: { color: "#65746C", fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: "center" },
  error: { color: "#B42318", fontSize: 14, lineHeight: 21, textAlign: "center" },
  retry: { backgroundColor: "#28735D", borderRadius: 8, marginTop: 14, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: "#FFFFFF", fontWeight: "800" },
});
