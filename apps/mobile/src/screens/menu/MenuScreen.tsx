import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react-native";
import { AppIcon, AppText, breakpoints, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { ProductImage } from "../shopping-cart/MarketProducts";
import { CardCaption, cardImageStyle, ProductCard, useCardGrid } from "../../components/ProductCard";
import CookingMode from "../recipes/CookingMode";
import RecipeDetail from "../recipes/RecipeDetail";
import { minutesText, totalMinutes, type Recipe } from "../recipes/recipeTypes";
import { addDays, dayKey, keyToDate, monthGridDays, MonthCalendar, startOfWeek, weekday, WeekTimetable, type MealType } from "./MenuCalendar";

type PeriodType = "DAY" | "WEEK" | "MONTH";
/** Saved by menu-service with each suggested dish (only the image is shown here now). */
type DishDetails = { imageUrl?: string | null };
type MenuItem = {
  id: string;
  recipeId?: string | null;
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
  /** Hash of the Kho snapshot the suggestions used (null for older or manual menus). */
  khoHash?: string | null;
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
const stepLabels: Record<PeriodType, { back: string; next: string; backA11y: string; nextA11y: string }> = {
  DAY: { back: "Hôm trước", next: "Hôm sau", backA11y: "Ngày trước", nextA11y: "Ngày sau" },
  WEEK: { back: "Tuần trước", next: "Tuần sau", backA11y: "Tuần trước", nextA11y: "Tuần sau" },
  MONTH: { back: "Tháng trước", next: "Tháng sau", backA11y: "Tháng trước", nextA11y: "Tháng sau" },
};

const mealLabels: Record<MealType, string> = {
  BREAKFAST: "Bữa sáng",
  LUNCH: "Bữa trưa",
  DINNER: "Bữa tối",
  SNACK: "Ăn nhẹ",
};
const mealOrder: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const DAY_MEALS: MealType[] = ["BREAKFAST", "LUNCH", "DINNER"];

/**
 * Auto-suggestions already started in this app session: "family:today" (no menu yet) and
 * "family:today:khoHash" (stale menu). Module level so reopening the tab does not suggest again, and a failed
 * request is not retried in a loop ("Làm mới theo kho" retries).
 */
const autoSuggested = new Set<string>();

const pad = (value: number) => String(value).padStart(2, "0");
const formatDay = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

/** First and last day (YYYY-MM-DD) the current view shows: one menu request covers all of it. */
function viewRange(period: PeriodType, date: Date): { from: string; to: string } {
  if (period === "DAY") return { from: dayKey(date), to: dayKey(date) };
  if (period === "WEEK") return { from: dayKey(startOfWeek(date)), to: dayKey(addDays(startOfWeek(date), 6)) };
  const days = monthGridDays(date);
  return { from: dayKey(days[0]), to: dayKey(days[days.length - 1]) };
}

function shiftPeriod(date: Date, period: PeriodType, direction: -1 | 1): Date {
  if (period === "DAY") return addDays(date, direction);
  if (period === "WEEK") return addDays(date, direction * 7);
  const target = new Date(date.getFullYear(), date.getMonth() + direction, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

const ownDayMenu = (menus: MenuRecord[], key: string) => menus.find((menu) => menu.periodType === "DAY" && menu.startDate.slice(0, 10) === key) ?? null;

/**
 * Dishes planned for a day: the day's own menu (Theo ngày suggestions) first, otherwise a week/month menu that
 * covers the day (those store a weekday). Newest menu wins.
 */
function itemsForDay(menus: MenuRecord[], key: string): MenuItem[] {
  const sorted = (items: MenuItem[]) => [...items].sort((left, right) => mealOrder.indexOf(left.mealType) - mealOrder.indexOf(right.mealType));
  const own = ownDayMenu(menus, key);
  if (own) return sorted(own.items);
  const covering = menus.find((menu) => menu.periodType !== "DAY" && menu.startDate.slice(0, 10) <= key && menu.endDate.slice(0, 10) >= key);
  if (!covering) return [];
  const day = weekday(keyToDate(key));
  return sorted(covering.items.filter((item) => item.dayOfWeek === day));
}

/**
 * A generated menu is stale when the Kho changed since: its stored Kho hash differs from the current one.
 * Older generated menus without a hash (they have suggestion details) count as stale once.
 */
const isStale = (menu: MenuRecord, currentHash: string): boolean =>
  menu.khoHash ? menu.khoHash !== currentHash : menu.items.some((item) => item.details != null);

/** "Lịch": the family's meal calendar (Theo ngày with shared dish cards, Theo tuần timetable, Theo tháng grid). */
export default function MenuScreen({ accessToken, familyId }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isWide = width >= breakpoints.wide;
  const horizontalPadding = width < 360 ? spacing.sm : isWide ? spacing.xl : spacing.lg;
  const cardGrid = useCardGrid();
  const [period, setPeriod] = useState<PeriodType>("DAY");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [followToday, setFollowToday] = useState(true);
  const [menus, setMenus] = useState<MenuRecord[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadId = useRef(0);
  const checkedMenus = useRef(new Set<string>());
  const api = createGatewayClient(accessToken);
  const { from, to } = viewRange(period, selectedDate);
  const todayKey = dayKey(new Date());
  const selectedKey = dayKey(selectedDate);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  /** Menus overlapping the shown day / week / month grid, in one request. */
  const loadMenus = async (): Promise<void> => {
    if (!accessToken) {
      setMenus([]);
      setLoading(false);
      return;
    }
    const id = ++loadId.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.get<MenuRecord[] | { items: MenuRecord[] }>(`/api/menu?from=${from}&to=${to}`);
      if (id !== loadId.current) return;
      setMenus(Array.isArray(result) ? result : result.items);
      setLoadFailed(false);
    } catch (requestError) {
      if (id !== loadId.current) return;
      setError(errorMessage(requestError));
      setLoadFailed(true);
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenus();
  }, [accessToken, from, to]);

  // Active recipes (image, total time, steps) for the dish cards and the detail screen.
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    api.get<Recipe[]>("/api/recipes?active=true")
      .then((list) => { if (active && Array.isArray(list)) setRecipes(new Map(list.map((recipe) => [recipe.id, recipe]))); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!followToday) return;
    const timer = setInterval(() => setSelectedDate(new Date()), 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setSelectedDate(new Date());
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [followToday]);

  /** Suggests the selected day's dishes from Kho; replaces that day's menu. */
  const suggest = async (options: { announce: boolean }): Promise<void> => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError("");
    try {
      const day = `${selectedKey}T00:00:00.000Z`;
      const result = await api.post<MenuRecord>("/api/menu/generate", {
        periodType: "DAY",
        startDate: day,
        endDate: day,
        ...(familyId ? { familyId } : {}),
      });
      checkedMenus.current.add(result.id);
      setMenus((current) => [
        result,
        ...current.filter((entry) => entry.id !== result.id && !(entry.periodType === "DAY" && entry.startDate.slice(0, 10) === result.startDate.slice(0, 10))),
      ]);
      if (options.announce) showToast(familyId ? "Đã gợi ý thực đơn theo Kho" : "Đã gợi ý thực đơn");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  /** Opens the shared recipe detail for a planned dish (from the loaded recipes, else loaded by id). */
  const openDish = async (item: MenuItem): Promise<void> => {
    if (!item.recipeId) {
      showToast("Món này chưa có công thức.");
      return;
    }
    const known = recipes.get(item.recipeId);
    if (known) { setDetail(known); return; }
    try {
      setDetail(await api.get<Recipe>(`/api/recipes/${encodeURIComponent(item.recipeId)}`));
    } catch (requestError) {
      showToast(errorMessage(requestError));
    }
  };

  const openDay = (key: string) => {
    setPeriod("DAY");
    setSelectedDate(keyToDate(key));
    setFollowToday(key === todayKey);
  };

  const dayItems = itemsForDay(menus, selectedKey);
  const todayMenu = selectedKey === todayKey ? ownDayMenu(menus, todayKey) : null;
  const canAutoSuggest = period === "DAY" && selectedKey === todayKey && !loading && !loadFailed && !busy && !!accessToken;

  // Today only (never past or future days): suggest once per family and day when it has no menu, never in a loop.
  useEffect(() => {
    if (!canAutoSuggest || dayItems.length > 0) return;
    const key = `${familyId ?? "no-family"}:${todayKey}`;
    if (autoSuggested.has(key)) return;
    autoSuggested.add(key);
    void suggest({ announce: false });
  }, [canAutoSuggest, dayItems.length, familyId, todayKey]);

  // Today's menu was made from another Kho: regenerate once per Kho change (compares the stored and current hash).
  useEffect(() => {
    if (!canAutoSuggest || !todayMenu || !familyId || checkedMenus.current.has(todayMenu.id)) return;
    checkedMenus.current.add(todayMenu.id);
    let active = true;
    api.get<{ khoHash: string }>(`/api/menu/kho-hash?familyId=${encodeURIComponent(familyId)}`)
      .then(({ khoHash }) => {
        if (!active || !isStale(todayMenu, khoHash)) return;
        const key = `${familyId}:${todayKey}:${khoHash}`;
        if (autoSuggested.has(key)) return;
        autoSuggested.add(key);
        void suggest({ announce: false });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [canAutoSuggest, todayMenu?.id, familyId, todayKey]);

  const rangeLabel = period === "DAY"
    ? formatDay(selectedDate)
    : period === "WEEK"
      ? `${formatDay(keyToDate(from)).slice(0, 5)} – ${formatDay(keyToDate(to))}`
      : `Tháng ${selectedDate.getMonth() + 1}/${selectedDate.getFullYear()}`;
  const steps = stepLabels[period];

  const dishCard = (item: MenuItem) => {
    const recipe = item.recipeId ? recipes.get(item.recipeId) : undefined;
    const minutes = recipe ? totalMinutes(recipe) : null;
    const kcal = item.calories == null ? "-- kcal" : `${Math.round(item.calories)} kcal`;
    return (
      <ProductCard
        key={item.id}
        width={cardGrid.cardWidth}
        accessibilityLabel={`${mealLabels[item.mealType]}: ${item.dishName}, ${kcal}${minutes !== null ? `, ${minutesText(minutes)}` : ""}. Mở công thức`}
        onPress={() => void openDish(item)}
        image={<ProductImage uri={recipe?.imageUrl ?? item.details?.imageUrl ?? null} style={cardImageStyle} />}
        name={item.dishName}
        subtitle={kcal}
        footer={minutes !== null ? <CardCaption text={minutesText(minutes)} /> : undefined}
      />
    );
  };

  const dishesFor = (key: string) => itemsForDay(menus, key);
  let scheduleContent: React.ReactNode;
  if (loading && menus.length === 0 && !(period === "DAY" && busy)) {
    scheduleContent = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="bodySmall" color={colors.muted}>Đang tải thực đơn</AppText>
      </View>
    );
  } else if (period === "WEEK") {
    scheduleContent = <WeekTimetable weekStart={keyToDate(from)} todayKey={todayKey} dishesFor={dishesFor} onOpenDay={openDay} />;
  } else if (period === "MONTH") {
    scheduleContent = <MonthCalendar anchor={selectedDate} todayKey={todayKey} dishesFor={dishesFor} onOpenDay={openDay} />;
  } else if (busy && dayItems.length === 0) {
    scheduleContent = (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="bodySmall" color={colors.muted}>Đang gợi ý món theo Kho</AppText>
      </View>
    );
  } else {
    const meals = dayItems.some((item) => item.mealType === "SNACK") ? [...DAY_MEALS, "SNACK" as MealType] : DAY_MEALS;
    scheduleContent = (
      <View style={styles.meals}>
        {meals.map((meal) => {
          const items = dayItems.filter((item) => item.mealType === meal);
          return (
            <View key={meal} style={styles.mealSection}>
              <Text style={styles.mealTitle} accessibilityRole="header">{mealLabels[meal]}</Text>
              {items.length === 0 ? (
                <Text style={styles.muted}>Chưa có món</Text>
              ) : (
                <View onLayout={cardGrid.onLayout} style={[styles.grid, { gap: cardGrid.gap }]}>{items.map(dishCard)}</View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: isWide ? breakpoints.extraWide : undefined, paddingHorizontal: horizontalPadding }]}
        refreshControl={<RefreshControl refreshing={loading && menus.length > 0} onRefresh={() => void loadMenus()} tintColor={colors.primary} />}
      >
        <View accessibilityRole="tablist" style={styles.periodTabs}>
          {periods.map((option) => {
            const selected = period === option.value;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={option.value}
                onPress={() => setPeriod(option.value)}
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
          <Pressable accessibilityRole="button" accessibilityLabel={steps.backA11y} onPress={() => { setFollowToday(false); setSelectedDate((date) => shiftPeriod(date, period, -1)); }} style={styles.navigationButton}>
            <AppIcon icon={ChevronLeft} size="sm" color={colors.primary} />
            <AppText variant="labelSmall" color={colors.primary}>{steps.back}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Đang xem ${rangeLabel}. Về hôm nay`} onPress={() => { setSelectedDate(new Date()); setFollowToday(true); }} style={styles.rangeButton}>
            <AppText variant="labelSmall" color={colors.text} style={styles.rangeText}>{rangeLabel}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={steps.nextA11y} onPress={() => { setFollowToday(false); setSelectedDate((date) => shiftPeriod(date, period, 1)); }} style={styles.navigationButton}>
            <AppText variant="labelSmall" color={colors.primary}>{steps.next}</AppText>
            <AppIcon icon={ChevronRight} size="sm" color={colors.primary} />
          </Pressable>
          {period === "DAY" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Làm mới theo kho: gợi ý lại món của ngày này từ nguyên liệu trong Kho"
              accessibilityState={{ busy, disabled: !accessToken || busy }}
              disabled={!accessToken || busy}
              onPress={() => void suggest({ announce: true })}
              style={[styles.refreshButton, (!accessToken || busy) && styles.disabled]}
            >
              {busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={RefreshCw} size="sm" color={colors.primary} />}
            </Pressable>
          )}
        </View>

        {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger} style={styles.message}>{error}</AppText>}
        {scheduleContent}
      </ScrollView>
      <RecipeDetail recipe={detail} onClose={() => setDetail(null)} onStartCooking={(recipe) => { setDetail(null); setCooking(recipe); }} />
      <CookingMode recipe={cooking} onClose={() => setCooking(null)} />
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
  refreshButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: touchTarget, justifyContent: "center", width: touchTarget },
  disabled: { opacity: 0.55 },
  message: { marginBottom: spacing.md },
  loading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xl },
  meals: { gap: spacing.lg },
  mealSection: { gap: spacing.sm },
  mealTitle: { ...textStyles.subheading },
  muted: { ...textStyles.bodySmall, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  toastWrap: { alignItems: "center", bottom: spacing.xl + 64, left: spacing.lg, position: "absolute", right: spacing.lg },
  toast: { ...textStyles.labelSmall, backgroundColor: colors.text, borderRadius: 20, color: colors.surface, overflow: "hidden", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
