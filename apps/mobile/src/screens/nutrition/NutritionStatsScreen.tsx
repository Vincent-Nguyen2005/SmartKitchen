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
  createNutritionStatsApi,
  DailyNutritionStats,
  NutritionStatsApiError,
} from "./nutritionStatsApi";

type Props = { apiBaseUrl: string; userId: string };

const today = (): string => new Date().toISOString().slice(0, 10);

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

export default function NutritionStatsScreen({
  apiBaseUrl,
  userId,
}: Props): React.JSX.Element {
  const [date, setDate] = useState(today);
  const [stats, setStats] = useState<DailyNutritionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(
    async (refresh = false): Promise<void> => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await createNutritionStatsApi(apiBaseUrl, userId).getDailyStats(date);
        setStats(result);
      } catch (requestError) {
        if (
          requestError instanceof NutritionStatsApiError &&
          requestError.status === 404
        ) {
          setError("Hãy tạo hồ sơ dinh dưỡng để xem mục tiêu cá nhân.");
        } else {
          setError("Không thể tải thống kê. Vui lòng kiểm tra kết nối và thử lại.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiBaseUrl, date, userId],
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const moveDate = (days: number): void => {
    const selected = new Date(`${date}T00:00:00.000Z`);
    selected.setUTCDate(selected.getUTCDate() + days);
    setDate(selected.toISOString().slice(0, 10));
  };

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={["#28735D"]}
            onRefresh={() => void loadStats(true)}
            refreshing={refreshing}
            tintColor="#28735D"
          />
        }
      >
        <Text style={styles.eyebrow}>DINH DƯỠNG HẰNG NGÀY</Text>
        <Text style={styles.title}>Thống kê dinh dưỡng</Text>
        <View style={styles.dateBar}>
          <Pressable
            accessibilityLabel="Ngày trước"
            accessibilityRole="button"
            onPress={() => moveDate(-1)}
            style={styles.dateArrow}
          >
            <Text style={styles.dateArrowText}>‹</Text>
          </Pressable>
          <Text style={styles.dateText}>
            {date === today() ? "Hôm nay · " : ""}
            {formatDay(date)}
          </Text>
          <Pressable
            accessibilityLabel="Ngày tiếp theo"
            accessibilityRole="button"
            disabled={date >= today()}
            onPress={() => moveDate(1)}
            style={[styles.dateArrow, date >= today() && styles.disabled]}
          >
            <Text style={styles.dateArrowText}>›</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#28735D" size="large" style={styles.loader} />
        ) : error ? (
          <View style={styles.empty}>
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
            <Pressable onPress={() => void loadStats()} style={styles.retry}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : stats ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.cardEyebrow}>NĂNG LƯỢNG</Text>
              <Text style={styles.calories}>
                {formatNumber(stats.totalCalories)}
                <Text style={styles.unit}> / {formatNumber(stats.targets.calories)} kcal</Text>
              </Text>
              <ProgressBar percent={stats.completionPercent.calories} color="#9ED5BD" />
              <Text style={styles.completion}>
                {stats.completionPercent.calories}% mục tiêu
              </Text>
            </View>
            <View style={styles.macroList}>
              <NutritionRow
                label="Protein"
                total={stats.totalProtein}
                target={stats.targets.protein}
                percent={stats.completionPercent.protein}
                color="#6BA98B"
              />
              <NutritionRow
                label="Carbs"
                total={stats.totalCarbs}
                target={stats.targets.carbs}
                percent={stats.completionPercent.carbs}
                color="#D9A944"
              />
              <NutritionRow
                label="Fat"
                total={stats.totalFat}
                target={stats.targets.fat}
                percent={stats.completionPercent.fat}
                color="#DF8367"
              />
            </View>
            <Text style={styles.note}>
              Mục tiêu calo ước tính theo hồ sơ; macro phân bổ theo quy ước 20% protein,
              50% carbs và 30% fat.
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
          {formatNumber(total)} / {formatNumber(target)} g · {percent}%
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
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${Math.min(percent, 100)}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F4F7F2", flex: 1 },
  content: { padding: 22, paddingBottom: 36 },
  eyebrow: { color: "#28735D", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 8 },
  title: { color: "#182A24", fontSize: 28, fontWeight: "800", marginTop: 8 },
  dateBar: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingHorizontal: 10,
  },
  dateArrow: { alignItems: "center", height: 44, justifyContent: "center", width: 42 },
  dateArrowText: { color: "#28735D", fontSize: 30, lineHeight: 34 },
  dateText: { color: "#35463E", flex: 1, fontSize: 13, fontWeight: "700", textAlign: "center" },
  summaryCard: { backgroundColor: "#183D32", borderRadius: 12, marginTop: 18, padding: 18 },
  cardEyebrow: { color: "#C1D8CB", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  calories: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", marginTop: 8 },
  unit: { color: "#B9D1C3", fontSize: 13, fontWeight: "600" },
  track: { backgroundColor: "#E6ECE7", borderRadius: 5, height: 8, marginTop: 10, overflow: "hidden" },
  fill: { borderRadius: 5, height: "100%" },
  completion: { color: "#D1E0D7", fontSize: 12, marginTop: 8 },
  macroList: { backgroundColor: "#FFFFFF", borderRadius: 12, marginTop: 14, paddingHorizontal: 16 },
  row: { borderBottomColor: "#E7ECE8", borderBottomWidth: 1, paddingBottom: 15, paddingTop: 15 },
  rowHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: "#35463E", fontSize: 14, fontWeight: "800" },
  rowAmount: { color: "#65746C", fontSize: 12, fontWeight: "600" },
  note: { color: "#738078", fontSize: 12, lineHeight: 18, marginTop: 14 },
  loader: { marginTop: 60 },
  empty: { alignItems: "center", marginTop: 48, padding: 20 },
  error: { color: "#B42318", fontSize: 14, lineHeight: 21, textAlign: "center" },
  retry: { backgroundColor: "#28735D", borderRadius: 8, marginTop: 14, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: "#FFFFFF", fontWeight: "800" },
  disabled: { opacity: 0.35 },
});
