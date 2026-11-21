import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { CookingPot, Search } from "lucide-react-native";
import { AppText, colors, spacing } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { EmptyState } from "../notifications/ui";
import { ProductImage } from "../shopping-cart/MarketProducts";
import { SEARCH_CONTENT_GAP, SearchBar } from "../../components/SearchBar";
import { CardCaption, cardImageStyle, ProductCard, useCardGrid } from "../../components/ProductCard";
import CookingMode from "./CookingMode";
import RecipeDetail from "./RecipeDetail";
import { minutesText, totalMinutes, type Recipe } from "./recipeTypes";

type Props = Readonly<{ accessToken: string | null }>;

/** "Nấu ăn": active recipes in the shared card grid; a card opens the detail, "Bắt đầu nấu" the cooking mode. */
export default function RecipeScreen({ accessToken }: Props): React.JSX.Element {
  const cardGrid = useCardGrid();
  const horizontalPadding = cardGrid.layout.width < 360 ? spacing.lg : spacing.xl;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const api = createGatewayClient(accessToken);

  const loadRecipes = async (): Promise<void> => {
    if (!accessToken) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Hidden dishes (isActive=false) stay hidden.
      const result = await api.get<Recipe[] | { items: Recipe[] }>("/api/recipes?active=true");
      setRecipes(Array.isArray(result) ? result : result.items);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecipes();
  }, [accessToken]);

  const visibleRecipes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return recipes;
    return recipes.filter((recipe) =>
      `${recipe.name} ${recipe.description ?? ""} ${recipe.ingredients.join(" ")}`.toLocaleLowerCase().includes(term));
  }, [recipes, search]);

  return (
    <View style={styles.screen}>
      <View style={[styles.searchHeader, { paddingHorizontal: horizontalPadding }]}>
        <SearchBar accessibilityLabel="Tìm món ăn" placeholder="Tìm theo tên hoặc nguyên liệu" value={search} onChangeText={setSearch} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }, visibleRecipes.length === 0 && styles.fill]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && recipes.length > 0} onRefresh={() => void loadRecipes()} tintColor={colors.primary} />}
      >
        {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger}>{error}</AppText>}
        {loading && recipes.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : visibleRecipes.length === 0 ? (
          <EmptyState fill icon={search ? Search : CookingPot} text={error ? "Không thể tải món ăn." : search ? "Không tìm thấy món ăn phù hợp." : "Chưa có món ăn nào."} />
        ) : (
          <View onLayout={cardGrid.onLayout} style={[styles.grid, { gap: cardGrid.gap }]}>
            {visibleRecipes.map((recipe) => {
              const minutes = totalMinutes(recipe);
              const timeText = minutes !== null ? minutesText(minutes) : "Thời gian linh hoạt";
              return (
                <ProductCard
                  key={recipe.id}
                  width={cardGrid.cardWidth}
                  accessibilityLabel={`${recipe.name}, ${timeText}${recipe.servings ? `, ${recipe.servings} phần` : ""}. Mở công thức`}
                  onPress={() => setDetail(recipe)}
                  image={<ProductImage uri={recipe.imageUrl} style={cardImageStyle} />}
                  name={recipe.name}
                  subtitle={timeText}
                  footer={recipe.servings ? <CardCaption text={`${recipe.servings} phần`} /> : undefined}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
      <RecipeDetail recipe={detail} onClose={() => setDetail(null)} onStartCooking={(recipe) => { setDetail(null); setCooking(recipe); }} />
      <CookingMode recipe={cooking} onClose={() => setCooking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  searchHeader: { paddingTop: spacing.xl, width: "100%" },
  content: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: SEARCH_CONTENT_GAP },
  fill: { flexGrow: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  loading: { alignItems: "center", paddingVertical: spacing.xl },
});
