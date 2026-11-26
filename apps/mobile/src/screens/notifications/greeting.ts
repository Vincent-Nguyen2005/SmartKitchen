/**
 * Time-of-day greeting at the top of Thông báo, and where a "Chào buổi sáng" push opens (pure helpers, tested in
 * greeting.test.ts). In-app only: nothing is stored, it is not a notification and not in the bell badge.
 * Times are Vietnam time (Asia/Ho_Chi_Minh = UTC+7, no daylight saving), whatever the device's own time zone.
 */
export type GreetingMeal = "BREAKFAST" | "LUNCH" | "DINNER";
export type GreetingIcon = "sun" | "cloud-sun" | "moon";
export type GreetingSlot = { meal: GreetingMeal; text: string; icon: GreetingIcon };

/** Minimal shape of a menu from GET /api/menu (same fields MenuScreen uses). */
export type GreetingMenu = {
  periodType: string;
  startDate: string;
  endDate: string;
  items: Array<{ dishName: string; mealType: string; dayOfWeek: number; details?: { role?: string | null } | null }>;
};

const HOUR = 60;
/** [start, end) in minutes since midnight, Vietnam time. */
const SLOTS: Array<{ start: number; end: number; slot: GreetingSlot }> = [
  { start: 7 * HOUR, end: 10 * HOUR, slot: { meal: "BREAKFAST", text: "Chào buổi sáng, chúc bạn một ngày vui vẻ!", icon: "sun" } },
  { start: 10 * HOUR, end: 14 * HOUR, slot: { meal: "LUNCH", text: "Chúc bạn buổi trưa an lành!", icon: "cloud-sun" } },
  { start: 17 * HOUR, end: 22 * HOUR, slot: { meal: "DINNER", text: "Chúc bạn buổi tối dịu êm!", icon: "moon" } },
];
/** Where the card can appear or disappear. */
const BOUNDARIES = [7 * HOUR, 10 * HOUR, 14 * HOUR, 17 * HOUR, 22 * HOUR];

export const MEAL_LABELS: Record<GreetingMeal, string> = { BREAKFAST: "Bữa sáng", LUNCH: "Bữa trưa", DINNER: "Bữa tối" };

/** Vietnam day (YYYY-MM-DD), minutes since midnight and weekday (Monday 1 … Sunday 7). */
export const vnNow = (now: Date): { day: string; minutes: number; weekday: number } => {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return {
    day: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * HOUR + shifted.getUTCMinutes(),
    weekday: ((shifted.getUTCDay() + 6) % 7) + 1,
  };
};

/** 07:00–09:59 sáng, 10:00–13:59 trưa, 17:00–21:59 tối; otherwise no card (null). */
export const greetingSlot = (now: Date): GreetingSlot | null => {
  const { minutes } = vnNow(now);
  return SLOTS.find((entry) => minutes >= entry.start && minutes < entry.end)?.slot ?? null;
};

/** Milliseconds until the next slot boundary (so an open screen switches greeting on time). */
export const msUntilNextBoundary = (now: Date): number => {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  const msToday = ((shifted.getUTCHours() * 60 + shifted.getUTCMinutes()) * 60 + shifted.getUTCSeconds()) * 1000 + shifted.getUTCMilliseconds();
  const next = BOUNDARIES.map((minutes) => minutes * 60_000).find((ms) => ms > msToday) ?? 24 * 3_600_000 + BOUNDARIES[0] * 60_000;
  return next - msToday;
};

const ROLE_ORDER = ["sang", "mot_mon", "man", "canh", "rau", "xao", "trang_mieng", "do_uong"];
const roleRank = (role: string | null | undefined): number => {
  const index = ROLE_ORDER.indexOf(role ?? "");
  return index < 0 ? ROLE_ORDER.indexOf("trang_mieng") - 0.5 : index;
};

/**
 * Dish names of one meal on `day` (as Lịch shows them): the day's own DAY menu first, else a week / month menu that
 * covers the day (items of that weekday). Lịch order (by role, then name), names de-duplicated.
 */
export const mealDishes = (menus: GreetingMenu[], day: string, weekday: number, meal: GreetingMeal): string[] => {
  const own = menus.find((menu) => menu.periodType === "DAY" && menu.startDate.slice(0, 10) === day);
  const covering = own ? null : menus.find((menu) => menu.periodType !== "DAY" && menu.startDate.slice(0, 10) <= day && menu.endDate.slice(0, 10) >= day);
  const items = own ? own.items : covering ? covering.items.filter((item) => item.dayOfWeek === weekday) : [];
  const sorted = items.filter((item) => item.mealType === meal)
    .sort((left, right) => roleRank(left.details?.role) - roleRank(right.details?.role) || left.dishName.localeCompare(right.dishName, "vi"));
  return [...new Set(sorted.map((item) => item.dishName.trim()).filter(Boolean))];
};

/** "Bữa sáng: Bánh mì trứng ốp la, Bún riêu cua"; null without dishes (greeting only). */
export const mealLine = (meal: GreetingMeal, dishes: string[]): string | null =>
  dishes.length > 0 ? `${MEAL_LABELS[meal]}: ${dishes.join(", ")}` : null;

/**
 * Where a tapped push opens: the morning push with a breakfast → Lịch on today's breakfast; the morning push without
 * a menu → the app home (null meal); anything else → not handled here (undefined).
 */
export const pushTarget = (data: unknown): { meal: GreetingMeal | null } | undefined => {
  const value = data as { type?: unknown; screen?: unknown; meal?: unknown } | null | undefined;
  if (value?.type !== "morning") return undefined;
  return value.screen === "menu" && (value.meal === "BREAKFAST" || value.meal === "LUNCH" || value.meal === "DINNER") ? { meal: value.meal } : { meal: null };
};
