import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { CookingPot, Search } from "lucide-react-native";
import { AppText, colors, spacing, textStyles } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { EmptyState } from "../notifications/ui";
import { ProductImage } from "../shopping-cart/MarketProducts";
import { SEARCH_CONTENT_GAP, SearchBar } from "../../components/SearchBar";
import { CardCaption, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { AI_DISCLAIMER, AiDishDetail, useAiDishes, type AiDish } from "./AiSuggestions";
import CookingMode from "./CookingMode";
import RecipeDetail from "./RecipeDetail";
import { minutesText, totalMinutes, type Recipe } from "./recipeTypes";

type Props = Readonly<{ accessToken: string | null }>;
type Section = "breakfast" | "lunch" | "dinner" | "other";
type Entry =
  | { kind: "recipe"; key: string; recipe: Recipe; sections: Section[]; search: string }
  | { kind: "ai"; key: string; dish: AiDish; saved: boolean; sections: Section[]; search: string };

const SECTIONS: Array<{ id: Section; title: string }> = [
  { id: "breakfast", title: "Bữa sáng" },
  { id: "lunch", title: "Bữa trưa" },
  { id: "dinner", title: "Bữa tối" },
  { id: "other", title: "Món khác" },
];
const RECIPE_MEALS: Record<string, Section> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };
const AI_MEALS: Record<string, Section> = { sang: "breakfast", trua: "lunch", toi: "dinner" };

/** Meal sections of a recipe (every matching meal); "Món khác" when it has none. */
const recipeSections = (recipe: Recipe): Section[] => {
  const sections = [...new Set(recipe.mealTypes.map((meal) => RECIPE_MEALS[meal.toLowerCase()]).filter((section): section is Section => !!section))];
  return sections.length ? sections : ["other"];
};
const aiSections = (dish: AiDish): Section[] => [dish.mealType ? AI_MEALS[dish.mealType] ?? "other" : "other"];
const nameKey = (name: string) => name.trim().toLocaleLowerCase("vi");

/**
 * "Nấu ăn": dishes grouped by meal (Bữa sáng, Bữa trưa, Bữa tối, Món khác). Admin recipes, AI suggestions and saved
 * AI dishes share the card grid; AI dishes carry an "AI" pill. A card opens the detail, then the cooking mode.
 */
export default function RecipeScreen({ accessToken }: Props): React.JSX.Element {
  const cardGrid = useCardGrid();
  const horizontalPadding = cardGrid.layout.width < 360 ? spacing.lg : spacing.xl;
  const ai = useAiDishes();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [aiDetail, setAiDetail] = useState<{ dish: AiDish; saved: boolean } | null>(null);
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

  const entries = useMemo<Entry[]>(() => {
    const searchText = (name: string, extra: string[]) => `${name} ${extra.join(" ")}`.toLocaleLowerCase("vi");
    const list: Entry[] = recipes.map((recipe) => ({
      kind: "recipe", key: `recipe-${recipe.id}`, recipe, sections: recipeSections(recipe),
      search: searchText(recipe.name, [recipe.description ?? "", ...recipe.ingredients]),
    }));
    // A suggestion that was also saved shows once (the suggestion, with today's Kho matching).
    const suggestionNames = new Set(ai.suggestions.map((dish) => nameKey(dish.name)));
    const aiDishes = [
      ...ai.suggestions.map((dish) => ({ dish, saved: false })),
      ...ai.saved.filter((dish) => !suggestionNames.has(nameKey(dish.name))).map((dish) => ({ dish, saved: true })),
    ];
    for (const { dish, saved } of aiDishes) {
      list.push({
        kind: "ai", key: `ai-${dish.id}`, dish, saved, sections: aiSections(dish),
        search: searchText(dish.name, [dish.description, ...dish.ingredients.map((ingredient) => ingredient.name)]),
      });
    }
    return list;
  }, [recipes, ai.suggestions, ai.saved]);

  const term = search.trim().toLocaleLowerCase("vi");
  const visible = term ? entries.filter((entry) => entry.search.includes(term)) : entries;
  const anyAiVisible = visible.some((entry) => entry.kind === "ai");

  const card = (entry: Entry, section: Section) => {
    if (entry.kind === "recipe") {
      const { recipe } = entry;
      const minutes = totalMinutes(recipe);
      const timeText = minutes !== null ? minutesText(minutes) : "Thời gian linh hoạt";
      return (
        <ProductCard
          key={`${section}-${entry.key}`}
          width={cardGrid.cardWidth}
          accessibilityLabel={`${recipe.name}, ${timeText}${recipe.servings ? `, ${recipe.servings} phần` : ""}. Mở công thức`}
          onPress={() => setDetail(recipe)}
          image={<ProductImage uri={recipe.imageUrl} style={cardImageStyle} />}
          name={recipe.name}
          subtitle={timeText}
          footer={recipe.servings ? <CardCaption text={`${recipe.servings} phần`} /> : undefined}
        />
      );
    }
    const { dish } = entry;
    const fromKho = dish.ingredients.filter((ingredient) => ingredient.fromKho).length;
    const missing = dish.ingredients.filter((ingredient) => !ingredient.fromKho);
    return (
      <ProductCard
        key={`${section}-${entry.key}`}
        width={cardGrid.cardWidth}
        accessibilityLabel={`Món AI gợi ý: ${dish.name}, ${dish.totalMinutes} phút, ${dish.servings} phần, dùng ${fromKho} nguyên liệu trong Kho`}
        onPress={() => setAiDetail({ dish, saved: entry.saved })}
        image={<ImagePlaceholder />}
        pill={{ label: "AI", tone: "ai" }}
        name={dish.name}
        subtitle={`${minutesText(dish.totalMinutes)} · ${dish.servings} phần`}
        footer={(
          <View>
            <CardCaption text={`Dùng ${fromKho} nguyên liệu trong Kho`} />
            {missing.length > 0 && <CardCaption warning text={`Thiếu: ${missing.map((ingredient) => ingredient.name.toLocaleLowerCase("vi")).join(", ")}`} />}
          </View>
        )}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.searchHeader, { paddingHorizontal: horizontalPadding }]}>
        <SearchBar accessibilityLabel="Tìm món ăn" placeholder="Tìm theo tên hoặc nguyên liệu" value={search} onChangeText={setSearch} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }, visible.length === 0 && styles.fill]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && recipes.length > 0} onRefresh={() => { void loadRecipes(); void ai.reloadSaved(); }} tintColor={colors.primary} />}
      >
        {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger}>{error}</AppText>}
        {anyAiVisible && <Text style={styles.disclaimer}>{AI_DISCLAIMER}</Text>}
        {ai.generating && <Text style={styles.muted}>Đang chuẩn bị gợi ý từ Kho...</Text>}
        {ai.limitReached && anyAiVisible && <Text style={styles.muted}>Đã đủ lượt gợi ý AI hôm nay, đây là gợi ý gần nhất.</Text>}
        {loading && recipes.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : visible.length === 0 ? (
          <EmptyState fill icon={term ? Search : CookingPot} text={error ? "Không thể tải món ăn." : term ? "Không tìm thấy món ăn phù hợp." : "Chưa có món ăn nào."} />
        ) : (
          SECTIONS.map((section) => {
            const inSection = visible.filter((entry) => entry.sections.includes(section.id));
            if (inSection.length === 0) return null;
            return (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
                <View onLayout={cardGrid.onLayout} style={[styles.grid, { gap: cardGrid.gap }]}>
                  {inSection.map((entry) => card(entry, section.id))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <RecipeDetail recipe={detail} onClose={() => setDetail(null)} onStartCooking={(recipe) => { setDetail(null); setCooking(recipe); }} />
      <AiDishDetail
        dish={aiDetail?.dish ?? null}
        isSaved={aiDetail?.saved ?? false}
        onClose={() => setAiDetail(null)}
        onStartCooking={(recipe) => { setAiDetail(null); setCooking(recipe); }}
        onSaved={() => void ai.reloadSaved()}
      />
      <CookingMode recipe={cooking} onClose={() => setCooking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  searchHeader: { paddingTop: spacing.xl, width: "100%" },
  content: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: SEARCH_CONTENT_GAP },
  fill: { flexGrow: 1 },
  section: { gap: spacing.sm },
  sectionTitle: { ...textStyles.subheading },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  loading: { alignItems: "center", paddingVertical: spacing.xl },
  disclaimer: { ...textStyles.caption, color: colors.warning },
  muted: { ...textStyles.bodySmall, color: colors.muted },
});
