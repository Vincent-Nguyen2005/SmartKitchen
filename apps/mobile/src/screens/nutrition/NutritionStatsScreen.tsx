import { useSession } from "../../services/session";
import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { DaySwitcher, vnToday } from "./DaySwitcher";
import { ProfileMissingCard } from "./ProfileMissingCard";
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
  createNutritionStatsApi,
  DailyNutritionStats,
  NutritionStatsApiError,
} from "./nutritionStatsApi";

/** onOpenProfile switches the Dinh dưỡng tab to the "Hồ sơ" segment. */
type Props = { onOpenProfile?: () => void };

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function NutritionStatsScreen({ onOpenProfile }: Props): React.JSX.Element {
  const { accessToken } = useSession();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 400;
  // Selected calendar day, YYYY-MM-DD; defaults to today in Vietnam time.
  const [date, setDate] = useState(() => vnToday());
  const [profileMissing, setProfileMissing] = useState(false);
  const [stats, setStats] = useState<DailyNutritionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(
    async (refresh = false): Promise<void> => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      setProfileMissing(false);
      try {
        const result = await createNutritionStatsApi(accessToken).getDailyStats(date);
        setStats(result);
      } catch (requestError) {
        if (
          requestError instanceof NutritionStatsApiError &&
          requestError.status === 404
        ) {
          setProfileMissing(true);
          setStats(null);
        } else {
          setError("Không thể tải thống kê. Vui lòng kiểm tra kết nối và thử lại.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, date],
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void loadStats(true)}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DINH DƯỠNG MỖI NGÀY</Text>
          <Text style={styles.title}>Thống kê dinh dưỡng</Text>
          <Text style={styles.subtitle}>
            Theo dõi năng lượng và dưỡng chất mỗi ngày.
          </Text>
        </View>

        <DaySwitcher value={date} onChange={setDate} />

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
        ) : profileMissing ? (
          <ProfileMissingCard onOpenProfile={onOpenProfile} />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Chưa thể tải thống kê</Text>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadStats()}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : stats ? (
          <>
            <View style={[styles.summaryCard, isCompact && styles.cardCompact]}>
              <Text style={styles.cardEyebrow}>NĂNG LƯỢNG ĐÃ NẠP</Text>
              <Text style={styles.calories}>
                {formatNumber(stats.totalCalories)}
                <Text style={styles.unit}> kcal</Text>
              </Text>
              <Text style={styles.targetText}>
                Mục tiêu: {formatNumber(stats.targets.calories)} kcal
              </Text>
              <ProgressBar percent={stats.completionPercent.calories} color={colors.primary} />
              <View style={[styles.progressCaption, isCompact && styles.progressCaptionCompact]}>
                <Text style={styles.progressText}>
                  {formatNumber(stats.completionPercent.calories)}% mục tiêu
                </Text>
                <Text style={styles.progressText}>
                  {stats.totalCalories > stats.targets.calories
                    ? `Vượt ${formatNumber(stats.totalCalories - stats.targets.calories)} kcal`
                    : `Còn ${formatNumber(stats.targets.calories - stats.totalCalories)} kcal`}
                </Text>
              </View>
            </View>

            <View style={[styles.macroCard, isCompact && styles.cardCompact]}>
              <Text style={styles.sectionTitle}>Dưỡng chất trong ngày</Text>
              <NutritionRow
                label="Đạm"
                total={stats.totalProtein}
                target={stats.targets.protein}
                percent={stats.completionPercent.protein}
                color={colors.success}
              />
              <NutritionRow
                label="Tinh bột"
                total={stats.totalCarbs}
                target={stats.targets.carbs}
                percent={stats.completionPercent.carbs}
                color={colors.warning}
              />
              <NutritionRow
                label="Chất béo"
                total={stats.totalFat}
                target={stats.targets.fat}
                percent={stats.completionPercent.fat}
                color={colors.danger}
              />
            </View>
            <Text style={styles.note}>
              Mục tiêu dựa trên hồ sơ dinh dưỡng. Tỉ lệ tham khảo: 20% đạm,
              50% tinh bột và 30% chất béo.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NutritionRow({
  label,
  total,
  target,
  percent,
  color,
}: {
  label: string;
  total: number;
  target: number;
  percent: number;
  color: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeading}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowAmount}>
          {formatNumber(total)} / {formatNumber(target)} g
        </Text>
      </View>
      <ProgressBar percent={percent} color={color} />
    </View>
  );
}

function ProgressBar({
  percent,
  color,
}: {
  percent: number;
  color: string;
}): React.JSX.Element {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(percent, 100))
    : 0;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${safePercent}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // SCRUM-232: center the dashboard and reduce spacing on narrow devices.
  contentCompact: { paddingHorizontal: spacing.md },
  cardCompact: { padding: spacing.md },
  progressCaptionCompact: { flexDirection: "column", alignItems: "flex-start" },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    width: "100%",
    maxWidth: 920,
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
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardEyebrow: {
    ...textStyles.caption,
    color: colors.muted,
    fontWeight: "700",
  },
  calories: {
    ...textStyles.heading,
    color: colors.text,
    marginTop: spacing.sm,
  },
  unit: { ...textStyles.bodySmall, color: colors.muted },
  targetText: {
    ...textStyles.bodySmall,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  track: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: spacing.sm,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  fill: { borderRadius: radius.pill, height: "100%" },
  progressCaption: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  progressText: { ...textStyles.caption, color: colors.muted, flexShrink: 1 },
  macroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { ...textStyles.subheading, color: colors.text },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
  },
  rowHeading: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  rowLabel: { ...textStyles.labelSmall, color: colors.text },
  rowAmount: {
    ...textStyles.caption,
    color: colors.muted,
    textAlign: "right",
    flexShrink: 1,
  },
  note: {
    ...textStyles.caption,
    color: colors.muted,
    marginTop: spacing.md,
  },
  loader: { marginTop: spacing.xl },
  empty: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: { ...textStyles.subheading, color: colors.text },
  error: {
    ...textStyles.bodySmall,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  retry: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: touchTarget,
  },
  retryText: { ...textStyles.labelSmall, color: colors.primary },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.82 },
});
