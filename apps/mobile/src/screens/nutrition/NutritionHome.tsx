import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Salad } from "lucide-react-native";
import { colors, radius, spacing, textStyles } from "../../theme";
import { useSession } from "../../services/session";
import { EmptyState, useLayout } from "../notifications/ui";
import { useConfirm } from "../../components/ConfirmDialog";
import { createMealDiaryApi, type MealLog } from "../meal-diary/mealDiaryApi";
import { createNutritionStatsApi, NutritionStatsApiError, type DailyNutritionStats } from "./nutritionStatsApi";
import { vnToday } from "./nutritionToday";

type Props = {
  /** Changes after the health profile was edited, so the targets reload. */
  refreshKey?: number;
};

/**
 * Targets used when the user has no health profile yet (shown with "Mục tiêu ước tính"): 2000 kcal with the same
 * macro split as nutrition-service (src/utils/targets.ts): 20 % protein, 55 % carbs, 25 % fat (4 / 4 / 9 kcal per g).
 */
const DEFAULT_CALORIES = 2000;
const MACRO_SPLIT = { protein: 0.2, carbs: 0.55, fat: 0.25 } as const;
const grams = (share: number, kcalPerGram: number) => Math.round((DEFAULT_CALORIES * share) / kcalPerGram);
const DEFAULT_TARGETS = {
  calories: DEFAULT_CALORIES,
  protein: grams(MACRO_SPLIT.protein, 4),
  carbs: grams(MACRO_SPLIT.carbs, 4),
  fat: grams(MACRO_SPLIT.fat, 9),
};

/** Today's totals from the meal diary, against the default targets (no profile: daily-stats answers 404). */
function estimatedStats(date: string, meals: MealLog[]): DailyNutritionStats {
  const items = meals.flatMap((meal) => meal.items);
  const sum = (pick: (item: (typeof items)[number]) => number | null) => items.reduce((total, item) => total + (pick(item) ?? 0) * item.quantity, 0);
  const totals = { calories: sum((item) => item.calories), protein: sum((item) => item.protein), carbs: sum((item) => item.carbs), fat: sum((item) => item.fat) };
  const percent = (value: number, target: number) => Math.round((value / target) * 100);
  return {
    date,
    totalCalories: totals.calories,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFat: totals.fat,
    targets: DEFAULT_TARGETS,
    completionPercent: {
      calories: percent(totals.calories, DEFAULT_TARGETS.calories),
      protein: percent(totals.protein, DEFAULT_TARGETS.protein),
      carbs: percent(totals.carbs, DEFAULT_TARGETS.carbs),
      fat: percent(totals.fat, DEFAULT_TARGETS.fat),
    },
  };
}

const MACROS: Array<{ key: "protein" | "carbs" | "fat"; label: string }> = [
  { key: "protein", label: "Đạm" },
  { key: "carbs", label: "Tinh bột" },
  { key: "fat", label: "Chất béo" },
];
const round = (value: number) => Math.round(value);
const ratio = (eaten: number, target: number) => (target > 0 ? Math.min(1, eaten / target) : 0);

/**
 * "Dinh dưỡng trong ngày": today's calories and Đạm / Tinh bột / Chất béo against the profile targets
 * (nutrition-service daily stats), and the dishes counted today (meal-diary) with "Bỏ" to un-log one.
 * Dishes are counted from Nấu ăn ("Hoàn thành" in cooking mode). Without a health profile the same screen uses
 * default targets ("Mục tiêu ước tính"); it never shows health-profile UI.
 */
export default function NutritionHome({ refreshKey = 0 }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const { gutter, isWide } = useLayout();
  const { confirm, dialog } = useConfirm();
  const [stats, setStats] = useState<DailyNutritionStats | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  /** No health profile: targets are the defaults. */
  const [estimated, setEstimated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const today = vnToday();

  const load = useCallback(async () => {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const [statsResult, historyResult] = await Promise.allSettled([
      createNutritionStatsApi(accessToken).getDailyStats(today),
      createMealDiaryApi(accessToken).getHistory(today),
    ]);
    const todayMeals = historyResult.status === "fulfilled" ? historyResult.value.meals : [];
    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
      setEstimated(false);
    } else if (statsResult.reason instanceof NutritionStatsApiError && statsResult.reason.status === 404) {
      setStats(estimatedStats(today, todayMeals));
      setEstimated(true);
    } else {
      setError(statsResult.reason instanceof Error ? statsResult.reason.message : "Không tải được dinh dưỡng hôm nay.");
    }
    if (historyResult.status === "fulfilled") setMeals(historyResult.value.meals);
    setLoading(false);
  }, [accessToken, today]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const unlog = async (meal: MealLog) => {
    const name = meal.items.map((item) => item.foodName).join(", ");
    if (removingId || !(await confirm({ title: "Bỏ món này khỏi hôm nay?", message: `${name} sẽ không còn được tính vào dinh dưỡng hôm nay.`, confirmLabel: "Bỏ" }))) return;
    setRemovingId(meal.id);
    try {
      await createMealDiaryApi(accessToken).deleteMeal(meal.id);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không bỏ được món này.");
    } finally {
      setRemovingId(null);
    }
  };

  const items = meals.flatMap((meal) => meal.items.map((item) => ({ meal, item })));
  let body: React.ReactNode;
  if (loading && !stats) {
    body = <View style={local.center}><ActivityIndicator color={colors.primary} /></View>;
  } else if (stats) {
    body = (
      <>
        <View style={local.card}>
          <Text style={local.cardLabel}>Năng lượng hôm nay</Text>
          <Text style={local.calories}>
            {round(stats.totalCalories)} <Text style={local.caloriesTarget}>/ {round(stats.targets.calories)} kcal</Text>
          </Text>
          <View style={local.track}><View style={[local.fillBar, { width: `${ratio(stats.totalCalories, stats.targets.calories) * 100}%` }]} /></View>
          {estimated && <Text style={local.estimate}>Mục tiêu ước tính</Text>}
          {MACROS.map((macro) => {
            const eaten = macro.key === "protein" ? stats.totalProtein : macro.key === "carbs" ? stats.totalCarbs : stats.totalFat;
            const target = stats.targets[macro.key];
            return (
              <View key={macro.key} style={local.macro} accessibilityLabel={`${macro.label}: ${round(eaten)} trên ${round(target)} gam`}>
                <View style={local.macroHeader}>
                  <Text style={local.macroLabel}>{macro.label}</Text>
                  <Text style={local.macroValue}>{round(eaten)} / {round(target)} g</Text>
                </View>
                <View style={local.track}><View style={[local.fillBar, { width: `${ratio(eaten, target) * 100}%` }]} /></View>
              </View>
            );
          })}
        </View>

        <Text style={local.section}>Món đã tính hôm nay</Text>
        {items.length === 0 ? (
          <Text style={local.hint}>Nấu xong một món ở Nấu ăn để tính vào hôm nay</Text>
        ) : (
          <View style={local.card}>
            {items.map(({ meal, item }) => (
              <View key={item.id} style={local.row}>
                <View style={local.rowText}>
                  <Text style={local.rowName} numberOfLines={2}>{item.foodName}</Text>
                  <Text style={local.rowKcal}>{round(item.calories * item.quantity)} kcal</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ ${item.foodName} khỏi hôm nay`}
                  disabled={removingId !== null}
                  hitSlop={6}
                  onPress={() => void unlog(meal)}
                  style={({ pressed }) => [local.remove, pressed && local.pressed, removingId !== null && local.disabled]}
                >
                  {removingId === meal.id ? <ActivityIndicator color={colors.danger} /> : <Text style={local.removeText}>Bỏ</Text>}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </>
    );
  } else {
    body = <EmptyState fill icon={Salad} text={error ?? "Không tải được dinh dưỡng hôm nay."} />;
  }

  return (
    <View style={local.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[local.content, { paddingHorizontal: gutter }, isWide && local.wide]}
        refreshControl={<RefreshControl refreshing={loading && !!stats} onRefresh={() => void load()} tintColor={colors.primary} />}
      >
        {!!error && stats && <Text accessibilityRole="alert" style={local.error}>{error}</Text>}
        {body}
      </ScrollView>
      {dialog}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.lg },
  wide: { alignSelf: "center", maxWidth: 720, width: "100%" },
  center: { alignItems: "center", paddingVertical: spacing.xl },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  cardLabel: { ...textStyles.labelSmall, color: colors.muted },
  calories: { ...textStyles.pageTitle, color: colors.primary },
  caloriesTarget: { ...textStyles.body, color: colors.muted },
  track: { backgroundColor: colors.border, borderRadius: radius.pill, height: 8, overflow: "hidden" },
  fillBar: { backgroundColor: colors.primary, height: "100%" },
  macro: { gap: spacing.xs },
  macroHeader: { flexDirection: "row", justifyContent: "space-between" },
  macroLabel: { ...textStyles.label },
  macroValue: { ...textStyles.bodySmall, color: colors.muted },
  section: { ...textStyles.subheading },
  hint: { ...textStyles.bodySmall, color: colors.muted },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowName: { ...textStyles.body },
  rowKcal: { ...textStyles.caption },
  remove: { alignItems: "center", borderColor: colors.danger, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: 32, minWidth: 48, paddingHorizontal: spacing.sm },
  removeText: { ...textStyles.labelSmall, color: colors.danger },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  error: { ...textStyles.bodySmall, color: colors.danger },
  estimate: { ...textStyles.caption },
});
