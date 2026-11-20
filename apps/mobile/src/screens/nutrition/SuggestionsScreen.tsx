import { useSession } from "../../services/session";
import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Leaf, ShieldCheck, Sparkles } from "lucide-react-native";
import {
  AppIcon,
  colors,
  radius,
  spacing,
  textStyles,
  touchTarget,
} from "../../theme";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Text,
  View,
} from "react-native";
import {
  createSuggestionsApi,
  PersonalizedSuggestions,
  SuggestionsApiError,
} from "./suggestionsApi";
import { ProfileMissingCard } from "./ProfileMissingCard";

/** onOpenProfile switches the Dinh dưỡng tab to the "Hồ sơ" segment. */
type Props = { onOpenProfile?: () => void };
type SuggestedRecipe = PersonalizedSuggestions["suggestions"][number];

function format(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function SuggestionsScreen({ onOpenProfile }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 400;
  const isDesktop = screenWidth >= 1100;
  const [result, setResult] = useState<PersonalizedSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [profileMissing, setProfileMissing] = useState(false);

  const load = useCallback(
    async (refresh = false): Promise<void> => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      setProfileMissing(false);
      try {
        setResult(await createSuggestionsApi(accessToken).get());
      } catch (requestError) {
        if (
          requestError instanceof SuggestionsApiError &&
          requestError.status === 404
        ) {
          setProfileMissing(true);
        } else {
          // 502 is expected today: nutrition-service asks recipe-service for GET /api/recipe with nutrition
          // fields recipe-service does not have, so treat any failure as "no suggestions yet" with a retry.
          setError("Gợi ý món ăn đang được chuẩn bị. Bạn có thể thử lại sau ít phút.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DINH DƯỠNG CÁ NHÂN</Text>
          <Text style={styles.title}>Gợi ý món ăn</Text>
          <Text style={styles.subtitle}>
            Khám phá các món phù hợp với nhu cầu dinh dưỡng của bạn.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.primary}
            size="large"
            style={styles.loader}
          />
        ) : profileMissing ? (
          <ProfileMissingCard onOpenProfile={onOpenProfile} />
        ) : error ? (
          <View style={styles.empty}>
            <AppIcon icon={Leaf} size="sm" color={colors.primary} />
            <Text style={styles.emptyTitle}>Chưa có gợi ý</Text>
            <Text accessibilityRole="alert" style={styles.emptyCopy}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : result ? (
          <>
            <View style={[styles.goalCard, isCompact && styles.cardCompact]}>
              <View style={styles.goalHeader}>
                <View style={styles.iconCircle}>
                  <AppIcon icon={Sparkles} size="sm" color={colors.primary} />
                </View>
                <Text style={styles.goalEyebrow}>
                  MỤC TIÊU THAM KHẢO MỖI BỮA
                </Text>
              </View>
              <View style={styles.goalCaloriesRow}>
                <Text style={styles.goalCalories}>
                  {format(result.targetPerMeal.calories)}
                </Text>
                <Text style={styles.goalUnit}>kcal</Text>
              </View>
              <View style={[styles.goalMacros, isCompact && styles.goalMacrosCompact]}>
                <MacroSummary
                  label="Đạm"
                  value={result.targetPerMeal.protein}
                />
                <MacroSummary
                  label="Tinh bột"
                  value={result.targetPerMeal.carbs}
                />
                <MacroSummary
                  label="Chất béo"
                  value={result.targetPerMeal.fat}
                />
              </View>
            </View>

            <View style={[styles.sectionHeading, isCompact && styles.sectionHeadingCompact]}>
              <Text style={styles.sectionTitle}>Món dành cho bạn</Text>
              <Text style={styles.sectionCount}>
                {result.suggestions.length} gợi ý
              </Text>
            </View>

            {result.suggestions.length === 0 ? (
              <View style={styles.empty}>
                <AppIcon icon={Leaf} size="sm" color={colors.primary} />
                <Text style={styles.emptyTitle}>Chưa có món phù hợp</Text>
                <Text style={styles.emptyCopy}>
                  Danh mục hiện chưa có món ăn, hoặc các món đã bị loại bởi
                  thông tin sức khỏe trong hồ sơ.
                </Text>
              </View>
            ) : (
              <View style={[styles.recipeList, isDesktop && styles.recipeListDesktop]}>
                {result.suggestions.map((recipe) => (
                  <RecipeCard key={recipe.id} recipe={recipe} desktop={isDesktop} compact={isCompact} />
                ))}
              </View>
            )}

            <View style={styles.safetyNote}>
              <AppIcon icon={ShieldCheck} size="sm" color={colors.primary} />
              <Text style={styles.safetyText}>
                Món có thông tin dị ứng hoặc chống chỉ định trùng hồ sơ sức khỏe
                sẽ được loại khỏi gợi ý khi có metadata tương ứng.
              </Text>
            </View>
            <Text style={styles.disclaimer}>
              Gợi ý dựa trên dữ liệu món ăn và hồ sơ bạn cung cấp; không thay
              thế tư vấn y tế.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroSummary({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.JSX.Element {
  return (
    <View style={styles.macroSummaryItem}>
      <Text style={styles.macroSummaryLabel}>{label}</Text>
      <Text style={styles.macroSummaryValue}>{format(value)} g</Text>
    </View>
  );
}

function RecipeCard({
  recipe,
  desktop,
  compact,
}: {
  recipe: SuggestedRecipe;
  desktop: boolean;
  compact: boolean;
}): React.JSX.Element {
  const safeScore = Number.isFinite(recipe.nutritionScore)
    ? Math.max(0, Math.min(recipe.nutritionScore, 100))
    : 0;

  return (
    <View style={[styles.recipeCard, desktop && styles.recipeCardDesktop, compact && styles.cardCompact]}>
      <View style={[styles.recipeHeading, compact && styles.recipeHeadingCompact]}>
        <Text style={styles.recipeName}>{recipe.name}</Text>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{recipe.nutritionScore}%</Text>
        </View>
      </View>
      {recipe.description ? (
        <Text style={styles.description}>{recipe.description}</Text>
      ) : null}

      <View style={styles.nutritionBlock}>
        <Text style={styles.recipeCalories}>
          {format(recipe.calories)} kcal
        </Text>
        <Text style={styles.recipeMacros}>
          Đạm {format(recipe.protein)} g · Tinh bột {format(recipe.carbs)} g ·{" "}
          Chất béo {format(recipe.fat)} g
        </Text>
      </View>

      {recipe.ingredients.length > 0 ? (
        <View style={styles.ingredientsBlock}>
          <Text style={styles.ingredientsLabel}>Nguyên liệu</Text>
          <Text style={styles.ingredientsText}>
            {recipe.ingredients.join(", ")}
          </Text>
        </View>
      ) : null}

      <View style={styles.scoreHeading}>
        <Text style={styles.scoreCaption}>Độ phù hợp dinh dưỡng ước tính</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${safeScore}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // SCRUM-232: compact cards on phones; two columns on roomy desktop widths.
  contentCompact: { paddingHorizontal: spacing.md },
  cardCompact: { padding: spacing.md },
  goalMacrosCompact: { flexDirection: "column" },
  sectionHeadingCompact: { flexWrap: "wrap" },
  recipeList: { width: "100%" },
  recipeListDesktop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  recipeCardDesktop: { width: "48.5%" },
  recipeHeadingCompact: { flexWrap: "wrap", gap: spacing.sm },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
  },
  header: { marginBottom: spacing.lg },
  eyebrow: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  title: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  loader: { marginTop: spacing.xl },
  goalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  goalHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: "center",
    height: touchTarget,
    width: touchTarget,
  },
  goalEyebrow: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
    flex: 1,
  },
  goalCaloriesRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  goalCalories: { ...textStyles.heading, color: colors.text },
  goalUnit: { ...textStyles.bodySmall, color: colors.muted },
  goalMacros: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  macroSummaryItem: { flex: 1, minWidth: 0 },
  macroSummaryLabel: { ...textStyles.caption, color: colors.muted },
  macroSummaryValue: {
    ...textStyles.labelSmall,
    color: colors.text,
    marginTop: spacing.xs,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...textStyles.subheading, color: colors.text, flex: 1 },
  sectionCount: { ...textStyles.caption, color: colors.muted },
  recipeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  recipeHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  recipeName: { ...textStyles.subheading, color: colors.text, flex: 1, minWidth: 0 },
  scoreBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  scoreText: { ...textStyles.labelSmall, color: colors.primary },
  description: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  nutritionBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  recipeCalories: { ...textStyles.label, color: colors.text },
  recipeMacros: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  ingredientsBlock: { marginTop: spacing.md },
  ingredientsLabel: { ...textStyles.labelSmall, color: colors.text },
  ingredientsText: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  scoreHeading: { marginTop: spacing.md },
  scoreCaption: { ...textStyles.caption, color: colors.muted },
  track: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: spacing.sm,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: "100%",
  },
  safetyNote: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  safetyText: { ...textStyles.caption, color: colors.text, flex: 1 },
  disclaimer: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.md,
  },
  empty: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginTop: spacing.sm,
  },
  emptyTitle: {
    ...textStyles.subheading,
    color: colors.text,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  emptyCopy: {
    ...textStyles.bodySmall,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  retry: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  retryText: { ...textStyles.labelSmall, color: colors.primary },
  pressed: { opacity: 0.8 },
});
