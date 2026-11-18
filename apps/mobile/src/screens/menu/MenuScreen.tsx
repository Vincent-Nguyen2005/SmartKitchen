import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, Sparkles } from "lucide-react-native";
import { AppIcon, AppText, breakpoints, colors, radius, spacing, touchTarget } from "../../theme";
import { inventoryApi } from "../inventory/inventoryApi";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";

type PeriodType = "DAY" | "WEEK" | "MONTH";
type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
type MenuItem = {
  id: string;
  dishName: string;
  mealType: MealType;
  dayOfWeek: number;
  calories: number | null;
};
type MenuRecord = {
  id: string;
  title: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  items: MenuItem[];
};
type PaymentProvider = "VNPAY" | "MOMO";
type CheckoutResponse = { paymentUrl: string; paymentId: string; order: { id: string } };
type Props = Readonly<{
  accessToken: string | null;
  familyId?: string | null;
  onPaymentStarted: (paymentUrl: string) => void;
}>;

const mockOrder = { orderId: "mock-order-123", amount: 50_000 };

const periods: Array<{ value: PeriodType; label: string }> = [
  { value: "DAY", label: "Theo ngày" },
  { value: "WEEK", label: "Theo tuần" },
  { value: "MONTH", label: "Theo tháng" },
];

const mealLabels: Record<MealType, string> = {
  BREAKFAST: "Bữa sáng",
  LUNCH: "Bữa trưa",
  DINNER: "Bữa tối",
  SNACK: "Ăn nhẹ",
};

const weekdayLabels = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const mealOrder: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function dateRange(period: PeriodType, now = new Date()): { startDate: string; endDate: string } {
  const today = utcDate(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "DAY") return { startDate: today.toISOString(), endDate: today.toISOString() };
  if (period === "WEEK") {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  return {
    startDate: utcDate(today.getUTCFullYear(), today.getUTCMonth(), 1).toISOString(),
    endDate: utcDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 0).toISOString(),
  };
}

function dayOfWeek(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function calendarDays(startDate: string, endDate: string): Date[] {
  const days: Date[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function shiftPeriod(date: Date, period: PeriodType, direction: -1 | 1): Date {
  const shifted = new Date(date);
  if (period === "DAY") shifted.setDate(shifted.getDate() + direction);
  else if (period === "WEEK") shifted.setDate(shifted.getDate() + direction * 7);
  else {
    const day = shifted.getDate();
    shifted.setDate(1);
    shifted.setMonth(shifted.getMonth() + direction);
    const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
    shifted.setDate(Math.min(day, lastDay));
  }
  return shifted;
}

export default function MenuScreen({ accessToken, familyId, onPaymentStarted }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isWide = width >= breakpoints.wide;
  const horizontalPadding = width < 360 ? spacing.sm : isWide ? spacing.xl : spacing.lg;
  const [period, setPeriod] = useState<PeriodType>("DAY");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [followToday, setFollowToday] = useState(true);
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);
  const [menus, setMenus] = useState<MenuRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "refresh" | null>(null);
  const [checkoutProvider, setCheckoutProvider] = useState<PaymentProvider | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const api = createGatewayClient(accessToken);

  const loadMenus = async (): Promise<void> => {
    if (!accessToken) {
      setMenus([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.get<MenuRecord[] | { items: MenuRecord[] }>("/api/menu");
      setMenus(Array.isArray(result) ? result : result.items);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenus();
  }, [accessToken]);

  useEffect(() => {
    if (!followToday) return;
    const timer = setInterval(() => setSelectedDate(new Date()), 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setSelectedDate(new Date());
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [followToday]);

  const generate = async (): Promise<void> => {
    if (!accessToken || busy) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const result = await api.post<MenuRecord>("/api/menu/generate", {
        periodType: period,
        ...dateRange(period, selectedDate),
      });
      setMenus((current) => [result, ...current.filter((menu) => menu.id !== result.id)]);
      setNotice("Đã tạo thực đơn gợi ý.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  };

  const refreshFromInventory = async (): Promise<void> => {
    if (!accessToken || busy) return;
    if (!familyId) {
      setError("Hãy tham gia gia đình để sử dụng dữ liệu kho.");
      return;
    }
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      const inventory = await inventoryApi.list(accessToken, familyId);
      const result = await api.post<{ replacements: unknown[] }>("/api/menu/auto-refresh", {
        inventoryItems: inventory.items.map(({ name }) => ({ name })),
      });
      setNotice(`Đã làm mới thực đơn. Món được thay thế: ${result.replacements.length}.`);
      await loadMenus();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  };

  const checkout = async (provider: PaymentProvider): Promise<void> => {
    if (!accessToken || busy || checkoutProvider) return;
    setCheckoutProvider(provider);
    setError("");
    setNotice("");
    try {
      const result = await api.post<CheckoutResponse>("/api/menu/checkout", {
        ...mockOrder,
        provider,
      });
      if (!result.paymentUrl) throw new Error("Payment service did not return a payment URL");
      setCheckoutProvider(null);
      onPaymentStarted(result.paymentUrl);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setCheckoutProvider(null);
    }
  };

  const range = dateRange(period, selectedDate);
  const menu = menus.find((entry) => entry.periodType === period && entry.startDate.slice(0, 10) === range.startDate.slice(0, 10) && entry.endDate.slice(0, 10) === range.endDate.slice(0, 10));
  const visibleDays = calendarDays(range.startDate, range.endDate).map((date) => ({
    date,
    key: date.toISOString().slice(0, 10),
    items: (menu?.items ?? []).filter((item) => item.dayOfWeek === dayOfWeek(date))
      .sort((left, right) => mealOrder.indexOf(left.mealType) - mealOrder.indexOf(right.mealType)),
  }));
  const daysWithMeals = visibleDays.filter((day) => day.items.length > 0);
  const rangeLabel = period === "DAY" ? formatDate(visibleDays[0].date) : `${formatDate(visibleDays[0].date)} – ${formatDate(visibleDays[visibleDays.length - 1].date)}`;
  let scheduleContent: React.ReactNode;
  if (loading) {
    scheduleContent = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="bodySmall" color={colors.muted}>Đang tải thực đơn</AppText>
      </View>
    );
  } else if (!menu) {
    scheduleContent = (
      <View style={styles.emptyState}>
        <AppText variant="subheading">Chưa có thực đơn</AppText>
        <AppText variant="bodySmall" color={colors.muted}>Tạo gợi ý để bắt đầu lên lịch bữa ăn.</AppText>
      </View>
    );
  } else if (daysWithMeals.length === 0) {
    scheduleContent = (
      <View style={styles.emptyState}>
        <AppText variant="bodySmall" color={colors.muted}>Chưa có món ăn trong khoảng ngày này.</AppText>
      </View>
    );
  } else {
    scheduleContent = (
      <View style={styles.mealList}>
        {daysWithMeals.map(({ date, key, items: dayItems }) => (
          <View key={key} style={styles.dayGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${weekdayLabels[dayOfWeek(date) - 1]}, ${formatDate(date)}, ${dayItems.length} món`} accessibilityState={{ expanded: !collapsedDates.includes(key) }} onPress={() => setCollapsedDates((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} style={styles.dayHeading}>
              <AppText variant="label" color={colors.primaryText}>{weekdayLabels[dayOfWeek(date) - 1]}, {formatDate(date)}</AppText>
              <View style={styles.dayCount}><AppText variant="labelSmall" color={colors.primaryText}>{dayItems.length} món</AppText><AppIcon icon={collapsedDates.includes(key) ? ChevronDown : ChevronUp} size="sm" color={colors.primaryText} /></View>
            </Pressable>
            {!collapsedDates.includes(key) && dayItems.map((item) => (
              <View key={item.id} style={styles.mealRow}>
                <View style={styles.mealMarker} />
                <View style={styles.mealDetails}>
                  <AppText variant="labelSmall" color={colors.muted}>{mealLabels[item.mealType]}</AppText>
                  <AppText variant="body">{item.dishName}</AppText>
                </View>
                <AppText variant="labelSmall" color={colors.primary}>
                  {item.calories == null ? "-- kcal" : `${Math.round(item.calories)} kcal`}
                </AppText>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { maxWidth: isWide ? breakpoints.extraWide : undefined, paddingHorizontal: horizontalPadding }]}>
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <AppIcon icon={CalendarDays} size="md" color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          <AppText variant="pageTitle">Thực Đơn Gia Đình</AppText>
          <AppText variant="bodySmall" color={colors.muted}>Lịch món ăn và dinh dưỡng</AppText>
        </View>
      </View>

      <View accessibilityRole="tablist" style={styles.periodTabs}>
        {periods.map((option) => {
          const selected = period === option.value;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => { setPeriod(option.value); setCollapsedDates([]); }}
              style={[styles.periodTab, selected && styles.periodTabSelected]}
            >
              <AppText variant="labelSmall" color={selected ? colors.primaryText : colors.muted}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.periodNavigation}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Lùi ${period === "DAY" ? "một ngày" : period === "WEEK" ? "một tuần" : "một tháng"}`} onPress={() => { setFollowToday(false); setSelectedDate((date) => shiftPeriod(date, period, -1)); setCollapsedDates([]); }} style={styles.navigationButton}>
          <AppIcon icon={ChevronLeft} size="sm" color={colors.primary} />
          <AppText variant="labelSmall" color={colors.primary}>Lùi</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Đang xem ${rangeLabel}. Về hôm nay`} onPress={() => { setSelectedDate(new Date()); setFollowToday(true); setCollapsedDates([]); }} style={styles.rangeButton}>
          <AppText variant="labelSmall" color={colors.text} style={styles.rangeText}>{rangeLabel}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Tiếp ${period === "DAY" ? "một ngày" : period === "WEEK" ? "một tuần" : "một tháng"}`} onPress={() => { setFollowToday(false); setSelectedDate((date) => shiftPeriod(date, period, 1)); setCollapsedDates([]); }} style={styles.navigationButton}>
          <AppText variant="labelSmall" color={colors.primary}>Tiếp</AppText>
          <AppIcon icon={ChevronRight} size="sm" color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.sectionHeading}>
        <AppText variant="heading">Lịch món ăn</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Tải lại thực đơn" onPress={() => void loadMenus()} style={styles.reloadButton}>
          <AppIcon icon={RefreshCw} size="sm" color={colors.muted} />
        </Pressable>
      </View>
      {scheduleContent}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !accessToken || busy !== null }}
          disabled={!accessToken || busy !== null}
          onPress={() => void generate()}
          style={[styles.primaryAction, (!accessToken || busy !== null) && styles.disabled]}
        >
          {busy === "generate" ? <ActivityIndicator color={colors.surface} /> : <AppIcon icon={Sparkles} size="sm" color={colors.surface} />}
          <AppText variant="labelSmall" color={colors.surface}>Tự động gợi ý thực đơn</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !accessToken || busy !== null }}
          disabled={!accessToken || busy !== null}
          onPress={() => void refreshFromInventory()}
          style={[styles.secondaryAction, (!accessToken || busy !== null) && styles.disabled]}
        >
          {busy === "refresh" ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={RefreshCw} size="sm" color={colors.primary} />}
          <AppText variant="labelSmall" color={colors.primary}>Làm mới theo kho</AppText>
        </Pressable>
      </View>

      <View style={styles.checkoutCard}>
        <AppText variant="label">Thanh toán thử nghiệm</AppText>
        <AppText variant="bodySmall" color={colors.muted}>
          Đơn hàng giả · {mockOrder.amount.toLocaleString("vi-VN")} VND
        </AppText>
        <View style={[styles.checkoutActions, width < 380 && styles.checkoutActionsCompact]}>
          {(["VNPAY", "MOMO"] as const).map((provider) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: checkoutProvider === provider, disabled: !accessToken || busy !== null || checkoutProvider !== null }}
              disabled={!accessToken || busy !== null || checkoutProvider !== null}
              key={provider}
              onPress={() => void checkout(provider)}
              style={[styles.checkoutButton, (!accessToken || busy !== null || checkoutProvider !== null) && styles.disabled]}
            >
              {checkoutProvider === provider ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <AppText variant="labelSmall" color={colors.surface}>
                  Thanh toán {provider === "VNPAY" ? "VNPay" : "MoMo"}
                </AppText>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger} style={styles.message}>{error}</AppText>}
      {!!notice && <AppText accessibilityRole="status" variant="bodySmall" color={colors.success} style={styles.message}>{notice}</AppText>}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: "center", backgroundColor: colors.background, flexGrow: 1, paddingBottom: spacing.xl, paddingTop: spacing.lg, width: "100%" },
  headingRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl },
  headingIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.md, height: 48, justifyContent: "center", width: 48 },
  headingText: { flex: 1, gap: spacing.xs },
  periodTabs: { backgroundColor: colors.border, borderRadius: radius.sm, flexDirection: "row", gap: 2, marginBottom: spacing.md, padding: 3 },
  periodTab: { alignItems: "center", borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xs },
  periodTabSelected: { backgroundColor: colors.primary },
  periodNavigation: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginBottom: spacing.lg },
  navigationButton: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, minWidth: 62 },
  rangeButton: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xs },
  rangeText: { textAlign: "center" },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  checkoutCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md },
  checkoutActions: { flexDirection: "row", gap: spacing.sm },
  checkoutActionsCompact: { flexDirection: "column" },
  checkoutButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: touchTarget + 4, paddingHorizontal: spacing.sm },
  primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget + 4, paddingHorizontal: spacing.md },
  secondaryAction: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget + 4, paddingHorizontal: spacing.md },
  disabled: { opacity: 0.55 },
  message: { marginBottom: spacing.md },
  sectionHeading: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, paddingBottom: spacing.sm },
  reloadButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  loading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyState: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.xl },
  mealList: { gap: spacing.lg, marginBottom: spacing.lg },
  dayGroup: { gap: spacing.sm },
  dayHeading: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, flexDirection: "row", justifyContent: "space-between", minHeight: touchTarget, paddingHorizontal: spacing.md },
  dayCount: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  mealRow: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 72, padding: spacing.md },
  mealMarker: { alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radius.pill, width: 4 },
  mealDetails: { flex: 1, gap: spacing.xs },
});
