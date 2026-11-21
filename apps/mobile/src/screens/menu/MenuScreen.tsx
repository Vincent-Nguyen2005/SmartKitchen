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
import { ChevronLeft, ChevronRight, RefreshCw, ShoppingCart } from "lucide-react-native";
import { AppIcon, AppText, breakpoints, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { createGatewayClient, errorMessage } from "../notifications/gatewayApi";
import { RemoteImage } from "../notifications/ui";
import { addToCart, findCatalogProduct, shoppingUnitFor } from "../shopping-cart/cart";
import { shoppingUnits, type ShoppingUnit } from "../shopping-cart/shoppingApi";
import { addDays, dayKey, keyToDate, monthGridDays, MonthCalendar, startOfWeek, weekday, WeekTimetable, type MealType } from "./MenuCalendar";

type PeriodType = "DAY" | "WEEK" | "MONTH";
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

/**
 * Days (family + date) already auto-suggested in this app session. Module level so leaving and reopening the tab
 * does not suggest again, and a failed request is not retried in a loop ("Làm mới theo kho" retries).
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

/**
 * Dishes planned for a day: the day's own menu (Theo ngày suggestions) first, otherwise a week/month menu that
 * covers the day (those store a weekday). Newest menu wins.
 */
function itemsForDay(menus: MenuRecord[], key: string): MenuItem[] {
  const sorted = (items: MenuItem[]) => [...items].sort((left, right) => mealOrder.indexOf(left.mealType) - mealOrder.indexOf(right.mealType));
  const own = menus.find((menu) => menu.periodType === "DAY" && menu.startDate.slice(0, 10) === key);
  if (own) return sorted(own.items);
  const covering = menus.find((menu) => menu.periodType !== "DAY" && menu.startDate.slice(0, 10) <= key && menu.endDate.slice(0, 10) >= key);
  if (!covering) return [];
  const day = weekday(keyToDate(key));
  return sorted(covering.items.filter((item) => item.dayOfWeek === day));
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
  const [menus, setMenus] = useState<MenuRecord[]>([]);
  const [recipeImages, setRecipeImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadId = useRef(0);
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

  // Current dish images set by the admin (Quản trị > Món ăn); the image saved with the suggestion is the fallback.
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    api.get<Array<{ id: string; imageUrl?: string | null }>>("/api/recipes?active=true")
      .then((recipes) => {
        if (!active || !Array.isArray(recipes)) return;
        setRecipeImages(new Map(recipes.flatMap((recipe) => (recipe.imageUrl ? [[recipe.id, recipe.imageUrl] as [string, string]] : []))));
      })
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

  const openDay = (key: string) => {
    setPeriod("DAY");
    setSelectedDate(keyToDate(key));
    setFollowToday(key === todayKey);
  };

  const dayItems = itemsForDay(menus, selectedKey);

  // Today only (never past or future days): suggest once per family and day when it has no menu, never in a loop.
  useEffect(() => {
    if (period !== "DAY" || selectedKey !== todayKey || loading || loadFailed || busy || dayItems.length > 0 || !accessToken) return;
    const key = `${familyId ?? "no-family"}:${todayKey}`;
    if (autoSuggested.has(key)) return;
    autoSuggested.add(key);
    void suggest({ announce: false });
  }, [period, selectedKey, todayKey, loading, loadFailed, busy, dayItems.length, accessToken, familyId]);

  const rangeLabel = period === "DAY"
    ? formatDay(selectedDate)
    : period === "WEEK"
      ? `${formatDay(keyToDate(from)).slice(0, 5)} – ${formatDay(keyToDate(to))}`
      : `Tháng ${selectedDate.getMonth() + 1}/${selectedDate.getFullYear()}`;
  const steps = stepLabels[period];

  const renderDish = (item: MenuItem) => {
    const details = item.details ?? null;
    const missing = details?.missingIngredients ?? [];
    const hasCounts = typeof details?.availableCount === "number" && typeof details?.totalCount === "number" && details.totalCount > 0;
    // The counts have their own line; the reason shows the rest (e.g. "Dùng trứng sắp hết hạn").
    const reason = (details?.reason ?? "").split(" · ").filter((part) => !part.startsWith("Có sẵn")).join(" · ");
    const imageUrl = (item.recipeId ? recipeImages.get(item.recipeId) : undefined) ?? details?.imageUrl ?? null;
    const adding = addingItemId === item.id;
    return (
      <View key={item.id} style={styles.dishCard}>
        <View style={styles.dishRow}>
          <RemoteImage uri={imageUrl} size={64} accessibilityLabel={item.dishName} />
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
  } else if (dayItems.length === 0) {
    scheduleContent = (
      <View style={styles.emptyState}>
        <AppText variant="subheading">Chưa có thực đơn</AppText>
        <AppText variant="bodySmall" color={colors.muted}>Bấm "Làm mới theo kho" để gợi ý món từ nguyên liệu đang có.</AppText>
      </View>
    );
  } else {
    scheduleContent = <View style={styles.mealList}>{dayItems.map(renderDish)}</View>;
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
        </View>

        <View style={styles.sectionHeading}>
          <AppText variant="heading">Lịch món ăn</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Tải lại thực đơn" onPress={() => void loadMenus()} style={styles.reloadButton}>
            {loading ? <ActivityIndicator color={colors.muted} /> : <AppIcon icon={RefreshCw} size="sm" color={colors.muted} />}
          </Pressable>
        </View>
        {!!error && <AppText accessibilityRole="alert" variant="bodySmall" color={colors.danger} style={styles.message}>{error}</AppText>}
        {scheduleContent}

        {period === "DAY" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Làm mới theo kho: gợi ý lại món của ngày này từ nguyên liệu trong Kho"
            accessibilityState={{ busy, disabled }}
            disabled={disabled}
            onPress={() => void suggest({ announce: true })}
            style={[styles.primaryAction, disabled && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={colors.surface} /> : <AppIcon icon={RefreshCw} size="sm" color={colors.surface} />}
            <AppText variant="labelSmall" color={colors.surface}>Làm mới theo kho</AppText>
          </Pressable>
        )}
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
  primaryAction: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginBottom: spacing.lg, marginTop: spacing.lg, minHeight: touchTarget + 4, paddingHorizontal: spacing.md },
  disabled: { opacity: 0.55 },
  message: { marginBottom: spacing.md },
  sectionHeading: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, paddingBottom: spacing.sm },
  reloadButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  loading: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyState: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.xl },
  mealList: { gap: spacing.md },
  dishCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  dishRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  dishText: { flex: 1, gap: spacing.xs },
  cartButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  toastWrap: { alignItems: "center", bottom: spacing.xl + 64, left: spacing.lg, position: "absolute", right: spacing.lg },
  toast: { ...textStyles.labelSmall, backgroundColor: colors.text, borderRadius: 20, color: colors.surface, overflow: "hidden", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
