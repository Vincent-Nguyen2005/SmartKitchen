import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { BookOpen, Search } from "lucide-react-native";
import { AppIcon, AppText, breakpoints, colors, radius, spacing, touchTarget } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";

type Recipe = {
  id: string;
  name: string;
  description?: string | null;
  ingredients: string[];
  mealTypes: string[];
  dietaryTags: string[];
  preparationMinutes?: number | null;
  servings?: number | null;
};

type Props = Readonly<{ accessToken: string | null }>;

export default function RecipeScreen({ accessToken }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const columns = width >= breakpoints.extraWide ? 3 : width >= breakpoints.wide ? 2 : 1;
  const horizontalPadding = width < 360 ? spacing.sm : width >= breakpoints.wide ? spacing.xl : spacing.lg;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      const result = await api.get<Recipe[] | { items: Recipe[] }>("/api/recipes");
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
      `${recipe.name} ${recipe.description ?? ""} ${recipe.ingredients.join(" ")}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [recipes, search]);

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={visibleRecipes}
        numColumns={columns}
        keyExtractor={(recipe) => recipe.id}
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: width >= breakpoints.wide ? breakpoints.extraWide : undefined,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        refreshing={loading}
        onRefresh={() => void loadRecipes()}
        ListHeaderComponent={
          <View>
            <View style={styles.heading}>
              <View style={styles.headingIcon}>
                <AppIcon icon={BookOpen} size="md" color={colors.primary} />
              </View>
              <View style={styles.headingText}>
                <AppText variant="pageTitle">Công thức món ăn</AppText>
                <AppText variant="bodySmall" color={colors.muted}>Khám phá món ăn và nguyên liệu</AppText>
              </View>
            </View>
            <View style={styles.searchBox}>
              <AppIcon icon={Search} size="sm" color={colors.muted} />
              <TextInput
                accessibilityLabel="Tìm công thức"
                placeholder="Tìm theo tên hoặc nguyên liệu"
                placeholderTextColor={colors.muted}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>
            {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger}>{error}</AppText>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <AppText variant="bodySmall" color={colors.muted}>
                {error ? "Không thể tải công thức." : search ? "Không tìm thấy công thức phù hợp." : "Chưa có công thức nào."}
              </AppText>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.recipeCard, columns > 1 && styles.recipeCardColumn]}>
            <AppText variant="subheading">{item.name}</AppText>
            {!!item.description && (
              <AppText variant="bodySmall" color={colors.muted}>{item.description}</AppText>
            )}
            <AppText variant="labelSmall" color={colors.primary}>
              {item.preparationMinutes ? `${item.preparationMinutes} phút` : "Thời gian linh hoạt"}
              {item.servings ? ` · ${item.servings} phần` : ""}
            </AppText>
            <AppText variant="bodySmall" color={colors.text}>
              Nguyên liệu: {item.ingredients.length ? item.ingredients.join(", ") : "Chưa cập nhật"}
            </AppText>
            {!!item.dietaryTags.length && (
              <AppText variant="bodySmall" color={colors.muted}>{item.dietaryTags.join(" · ")}</AppText>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { alignSelf: "center", flexGrow: 1, paddingBottom: spacing.xl, paddingTop: spacing.lg, width: "100%" },
  heading: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 48, justifyContent: "center", width: 48 },
  headingText: { flex: 1, gap: spacing.xs },
  searchBox: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, minHeight: touchTarget, paddingHorizontal: spacing.md },
  searchInput: { color: colors.text, flex: 1, minHeight: touchTarget, paddingVertical: spacing.sm },
  columns: { gap: spacing.md, justifyContent: "space-between" },
  recipeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md },
  recipeCardColumn: { flex: 1 },
  empty: { alignItems: "center", minHeight: 140, justifyContent: "center", padding: spacing.lg },
});
