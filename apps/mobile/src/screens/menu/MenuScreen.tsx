import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, ShoppingCart } from "lucide-react-native";
import { AppIcon, AppText, breakpoints, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { RemoteImage } from "../notifications/ui";
import { addToCart, findCatalogProduct, shoppingUnitFor } from "../shopping-cart/cart";
import { shoppingUnits, type ShoppingUnit } from "../shopping-cart/shoppingApi";

type PeriodType = "DAY" | "WEEK" | "MONTH";
type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
type MissingIngredient = { name: string; quantity: number | null; unit: string | null };
/** Saved by menu-service with each suggested dish (null for manual items and older menus). */
type DishDetails = {
  imageUrl?: string | null;
  availableIngredients?: string[];
  missingIngredients?: MissingIngredient[];
  availableCount?: number;
  totalCount?: number;
  reason?: string;
};
type MenuItem = {
  id: string;
  dishName: string;
  mealType: MealType;
  dayOfWeek: number;
  calories: number | null;
  details?: DishDetails | null;
};
type MenuRecord = {
  id: string;
  title: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  items: MenuItem[];
};
type Props = Readonly<{
  accessToken: string | null;
  familyId?: string | null;
}>;

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

/**
 * Days (family + date) already auto-suggested in this app session. Module level so leaving and reopening the tab
 * does not suggest again, and a failed request is not retried in a loop ("Làm mới theo kho" retries).
 */
const autoSuggested = new Set<string>();

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

const isShoppingUnit = (unit: string | null): unit is ShoppingUnit => shoppingUnits.includes(unit as ShoppingUnit);
const unitScale: Partial<Record<ShoppingUnit, { group: string; factor: number }>> = {
  GRAM: { group: "mass", factor: 1 },
  KILOGRAM: { group: "mass", factor: 1000 },
  MILLILITER: { group: "volume", factor: 1 },
  LITER: { group: "volume", factor: 1000 },
};

/** Quantity in another unit of the same kind (g ↔ kg, ml ↔ l); null when they cannot be converted. */
function convertQuantity(quantity: number, from: ShoppingUnit, to: ShoppingUnit): number | null {
  if (from === to) return quantity;
  const [source, target] = [unitScale[from], unitScale[to]];
  if (!source || !target || source.group !== target.group) return null;
  return Math.ceil(((quantity * source.factor) / target.factor) * 100) / 100;
}

/** Adds one missing ingredient to Giỏ hàng; with the catalog price when the product's unit fits the recipe's. */
async function addMissingToCart(accessToken: string, familyId: string, ingredient: MissingIngredient): Promise<void> {
  const quantity = ingredient.quantity && ingredient.quantity > 0 ? ingredient.quantity : 1;
  const unit = isShoppingUnit(ingredient.unit) ? ingredient.unit : null;
  const product = await findCatalogProduct(accessToken, ingredient.name).catch(() => null);
  if (product) {
    const productUnit = shoppingUnitFor(product);
    const converted = unit ? convertQuantity(quantity, unit, productUnit) : quantity;
    if (converted !== null) {
      await addToCart(accessToken, familyId, { name: product.name, quantity: converted, unit: productUnit, product });
      return;
    }
  }
  await addToCart(accessToken, familyId, { name: ingredient.name, quantity, unit: unit ?? "PIECE" });
}

export default function MenuScreen({ accessToken, familyId }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isWide = width >= breakpoints.wide;
  const horizontalPadding = width < 360 ? spacing.sm : isWide ? spacing.xl : spacing.lg;
  const [period, setPeriod] = useState<PeriodType>("DAY");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [followToday, setFollowToday] = useState(true);
  const [collapsedDates, setCollapsedDates] = useState<string[]>([]);
  const [menus, setMenus] = useState<MenuRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = createGatewayClient(accessToken);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

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
      setLoadFailed(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setLoadFailed(true);
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

  /** Suggests dishes from Kho for the shown period; replaces the menu of the same period and dates. */
  const suggest = async (options: { announce: boolean }): Promise<void> => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post<MenuRecord>("/api/menu/generate", {
        periodType: period,
        ...dateRange(period, selectedDate),
        ...(familyId ? { familyId } : {}),
      });
      setMenus((current) => [
        result,
        ...current.filter((entry) => entry.id !== result.id
          && !(entry.periodType === result.periodType && entry.startDate.slice(0, 10) === result.startDate.slice(0, 10) && entry.endDate.slice(0, 10) === result.endDate.slice(0, 10))),
      ]);
      if (options.announce) showToast(familyId ? "Đã gợi ý thực đơn theo Kho" : "Đã gợi ý thực đơn");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const addMissing = async (item: MenuItem): Promise<void> => {
    const missing = item.details?.missingIngredients ?? [];
    if (!accessToken || addingItemId || missing.length === 0) return;
    if (!familyId) {
      showToast("Hãy tham gia gia đình để dùng Giỏ hàng");
      return;
    }
    setAddingItemId(item.id);
    let added = 0;
    for (const ingredient of missing) {
      try {
        await addMissingToCart(accessToken, familyId, ingredient);
        added += 1;
      } catch {
        // Keep going; the toast says how many were added.
      }
    }
    setAddingItemId(null);
    showToast(added === missing.length
      ? `Đã thêm ${added} nguyên liệu vào giỏ hàng`
      : `Đã thêm ${added}/${missing.length} nguyên liệu. Hãy thử lại phần còn lại.`);
  };

  const range = dateRange(period, selectedDate);
  const menu = menus.find((entry) => entry.periodType === period && entry.startDate.slice(0, 10) === range.startDate.slice(0, 10) && entry.endDate.slice(0, 10) === range.endDate.slice(0, 10));
  const todayKey = dateRange("DAY").startDate.slice(0, 10);
  const rangeKey = range.startDate.slice(0, 10);

  // A day (today or later) with no menu: suggest once per family and day, never in a loop.
  useEffect(() => {
    if (period !== "DAY" || loading || loadFailed || busy || menu || !accessToken || rangeKey < todayKey) return;
    const key = `${familyId ?? "no-family"}:${rangeKey}`;
    if (autoSuggested.has(key)) return;
    autoSuggested.add(key);
    void suggest({ announce: false });
  }, [period, loading, loadFailed, busy, menu, accessToken, familyId, rangeKey, todayKey]);

  const visibleDays = calendarDays(range.startDate, range.endDate).map((date) => ({
    date,
    key: date.toISOString().slice(0, 10),
    items: (menu?.items ?? []).filter((item) => item.dayOfWeek === dayOfWeek(date))
      .sort((left, right) => mealOrder.indexOf(left.mealType) - mealOrder.indexOf(right.mealType)),
  }));
  const daysWithMeals = visibleDays.filter((day) => day.items.length > 0);
  const rangeLabel = period === "DAY" ? formatDate(visibleDays[0].date) : `${formatDate(visibleDays[0].date)} – ${formatDate(visibleDays[visibleDays.length - 1].date)}`;

  const renderDish = (item: MenuItem) => {
    const details = item.details ?? null;
    const missing = details?.missingIngredients ?? [];
    const hasCounts = typeof details?.availableCount === "number" && typeof details?.totalCount === "number" && details.totalCount > 0;
    // The counts have their own line; the reason shows the rest (e.g. "Dùng trứng sắp hết hạn").
    const reason = (details?.reason ?? "").split(" · ").filter((part) => !part.startsWith("Có sẵn")).join(" · ");
    const adding = addingItemId === item.id;
    return (
      <View key={item.id} style={styles.dishCard}>
        <View style={styles.dishRow}>
          <RemoteImage uri={details?.imageUrl ?? null} size={56} accessibilityLabel={item.dishName} />
          <View style={styles.dishText}>
            <AppText variant="labelSmall" color={colors.muted}>{mealLabels[item.mealType]}</AppText>
            <AppText variant="subheading">{item.dishName}</AppText>
            {hasCounts && (
              <AppText variant="bodySmall" color={colors.primary}>Có sẵn {details?.availableCount}/{details?.totalCount} nguyên liệu</AppText>
            )}
            {!!reason && <AppText variant="bodySmall" color={colors.muted}>{reason}</AppText>}
            {missing.length > 0 && (
              <AppText variant="bodySmall" color={colors.muted}>Thiếu: {missing.map((ingredient) => ingredient.name.toLocaleLowerCase("vi")).join(", ")}</AppText>
            )}
          </View>
          <AppText variant="labelSmall" color={colors.primary}>
            {item.calories == null ? "-- kcal" : `${Math.round(item.calories)} kcal`}
          </AppText>
        </View>
        {missing.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Thêm ${missing.length} nguyên liệu còn thiếu của ${item.dishName} vào giỏ hàng`}
            accessibilityState={{ busy: adding, disabled: addingItemId !== null }}
            disabled={addingItemId !== null}
            onPress={() => void addMissing(item)}
            style={[styles.cartButton, addingItemId !== null && styles.disabled]}
          >
            {adding ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={ShoppingCart} size="sm" color={colors.primary} />}
            <AppText variant="labelSmall" color={colors.primary}>Thêm phần thiếu vào giỏ hàng</AppText>
          </Pressable>
        )}
      </View>
    );
  };

  let scheduleContent: React.ReactNode;
  if (loading || (busy && !menu)) {
    scheduleContent = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="bodySmall" color={colors.muted}>{loading ? "Đang tải thực đơn" : "Đang gợi ý món theo Kho"}</AppText>
      </View>
    );
  } else if (!menu) {
    scheduleContent = (
      <View style={styles.emptyState}>
        <AppText variant="subheading">Chưa có thực đơn</AppText>
        <AppText variant="bodySmall" color={colors.muted}>Bấm "Làm mới theo kho" để gợi ý món từ nguyên liệu đang có.</AppText>
      </View>
    );
  } else if (daysWithMeals.length === 0) {
    scheduleContent = (
      <View style={styles.emptyState}>
        <AppText variant="bodySmall" color={colors.muted}>Chưa có món ăn trong khoảng ngày này.</AppText>
      </View>
    );
  } else if (period === "DAY") {
    scheduleContent = <View style={styles.mealList}>{daysWithMeals[0].items.map(renderDish)}</View>;
  } else {
    scheduleContent = (
      <View style={styles.mealList}>
        {daysWithMeals.map(({ date, key, items: dayItems }) => (
          <View key={key} style={styles.dayGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${weekdayLabels[dayOfWeek(date) - 1]}, ${formatDate(date)}, ${dayItems.length} món`} accessibilityState={{ expanded: !collapsedDates.includes(key) }} onPress={() => setCollapsedDates((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])} style={styles.dayHeading}>
              <AppText variant="label" color={colors.primaryText}>{weekdayLabels[dayOfWeek(date) - 1]}, {formatDate(date)}</AppText>
              <View style={styles.dayCount}><AppText variant="labelSmall" color={colors.primaryText}>{dayItems.length} món</AppText><AppIcon icon={collapsedDates.includes(key) ? ChevronDown : ChevronUp} size="sm" color={colors.primaryText} /></View>
            </Pressable>
            {!collapsedDates.includes(key) && dayItems.map(renderDish)}
          </View>
        ))}
      </View>
    );
  }

  const disabled = !accessToken || busy;
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: isWide ? breakpoints.extraWide : undefined, paddingHorizontal: horizontalPadding }]}>
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
        {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger} style={styles.message}>{error}</AppText>}
        {scheduleContent}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Làm mới theo kho: gợi ý lại món từ nguyên liệu trong Kho"
          accessibilityState={{ busy, disabled }}
          disabled={disabled}
          onPress={() => void suggest({ announce: true })}
          style={[styles.primaryAction, disabled && styles.disabled]}
        >
          {busy ? <ActivityIndicator color={colors.surface} /> : <AppIcon icon={RefreshCw} size="sm" color={colors.surface} />}
          <AppText variant="labelSmall" color={colors.surface}>Làm mới theo kho</AppText>
        </Pressable>
      </ScrollView>
      {toast && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.toast}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { alignSelf: "center", backgroundColor: colors.background, flexGrow: 1, paddingBottom: spacing.xl, paddingTop: spacing.lg, width: "100%" },
  periodTabs: { backgroundColor: colors.border, borderRadius: radius.sm, flexDirection: "row", gap: 2, marginBottom: spacing.md, padding: 3 },
  periodTab: { alignItems: "center", borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xs },
  periodTabSelected: { backgroundColor: colors.primary },
  periodNavigation: { alignItems: "center", flexDirection: "row", gap: spacing.xs, marginBottom: spacing.lg },
  navigationButton: { alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, minWidth: 62 },
  rangeButton: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xs },
  rangeText: { textAlign: "center" },
  primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginBottom: spacing.lg, minHeight: touchTarget + 4, paddingHorizontal: spacing.md },
  disabled: { opacity: 0.55 },
  message: { marginBottom: spacing.md },
  sectionHeading: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, paddingBottom: spacing.sm },
  reloadButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  loading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyState: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.sm, marginBottom: spacing.lg, paddingVertical: spacing.xl },
  mealList: { gap: spacing.md, marginBottom: spacing.lg },
  dayGroup: { gap: spacing.sm },
  dayHeading: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, flexDirection: "row", justifyContent: "space-between", minHeight: touchTarget, paddingHorizontal: spacing.md },
  dayCount: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  dishCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  dishRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  dishText: { flex: 1, gap: spacing.xs },
  cartButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  toastWrap: { alignItems: "center", bottom: spacing.xl + 64, left: spacing.lg, position: "absolute", right: spacing.lg },
  toast: { ...textStyles.labelSmall, backgroundColor: colors.text, borderRadius: 20, color: colors.surface, overflow: "hidden", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
