import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { HeartPulse, Salad } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { EmptyState, useLayout } from "../notifications/ui";
import { useConfirm } from "../../components/ConfirmDialog";
import { createMealDiaryApi, type MealLog } from "../meal-diary/mealDiaryApi";
import { createNutritionStatsApi, NutritionStatsApiError, type DailyNutritionStats } from "./nutritionStatsApi";
import { vnToday } from "./nutritionToday";

type Props = {
  /** Opens Hồ sơ › "Thông tin sức khỏe" (the nutrition profile form). */
  onOpenHealthProfile?: () => void;
  /** Changes after the health profile was edited, so the targets reload. */
  refreshKey?: number;
};

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
 * Dishes are counted from Nấu ăn ("Hoàn thành" in cooking mode).
 */
export default function NutritionHome({ onOpenHealthProfile, refreshKey = 0 }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const { gutter, isWide } = useLayout();
  const { confirm, dialog } = useConfirm();
  const [stats, setStats] = useState<DailyNutritionStats | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [noProfile, setNoProfile] = useState(false);
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
    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
      setNoProfile(false);
    } else if (statsResult.reason instanceof NutritionStatsApiError && statsResult.reason.status === 404) {
      setStats(null);
      setNoProfile(true);
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
  if (loading && !stats && !noProfile) {
    body = <View style={local.center}><ActivityIndicator color={colors.primary} /></View>;
  } else if (noProfile) {
    body = (
      <View style={local.fill}>
        <EmptyState fill icon={HeartPulse} text="Cập nhật Thông tin sức khỏe để có mục tiêu dinh dưỡng" />
        {onOpenHealthProfile && (
          <Pressable accessibilityRole="button" onPress={onOpenHealthProfile} style={({ pressed }) => [local.button, pressed && local.pressed]}>
            <AppIcon icon={HeartPulse} size="sm" color={colors.primaryText} />
            <Text style={local.buttonText}>Mở Thông tin sức khỏe</Text>
          </Pressable>
        )}
      </View>
    );
  } else if (stats) {
    body = (
      <>
        <View style={local.card}>
          <Text style={local.cardLabel}>Năng lượng hôm nay</Text>
          <Text style={local.calories}>
            {round(stats.totalCalories)} <Text style={local.caloriesTarget}>/ {round(stats.targets.calories)} kcal</Text>
          </Text>
          <View style={local.track}><View style={[local.fillBar, { width: `${ratio(stats.totalCalories, stats.targets.calories) * 100}%` }]} /></View>
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
        refreshControl={<RefreshControl refreshing={loading && (!!stats || noProfile)} onRefresh={() => void load()} tintColor={colors.primary} />}
      >
        {!!error && (stats || noProfile) && <Text accessibilityRole="alert" style={local.error}>{error}</Text>}
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
  fill: { alignItems: "center", flexGrow: 1, gap: spacing.md },
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
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  buttonText: { ...textStyles.labelSmall, color: colors.primaryText },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  error: { ...textStyles.bodySmall, color: colors.danger },
});
