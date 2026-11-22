import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { colors, radius, spacing, textStyles } from "../../theme";

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type CalendarDish = { id: string; dishName: string; mealType: MealType };

const pad = (value: number) => String(value).padStart(2, "0");
/** Local calendar day as YYYY-MM-DD (menus store that day at UTC midnight). */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Local Date for a YYYY-MM-DD key. */
export const keyToDate = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
export const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** Monday-based weekday: 1 (T2) … 7 (CN). */
export const weekday = (date: Date): number => ((date.getDay() + 6) % 7) + 1;
export const startOfWeek = (date: Date): Date => addDays(date, 1 - weekday(date));
const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const dayMonth = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;

/** Days shown in the month grid: from the Monday on/before the 1st to the Sunday on/after the last day. */
export function monthGridDays(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const days: Date[] = [];
  for (let day = startOfWeek(first); day <= addDays(startOfWeek(last), 6); day = addDays(day, 1)) days.push(day);
  return days;
}

const MEAL_ROWS: Array<{ meal: MealType; label: string }> = [
  { meal: "BREAKFAST", label: "Bữa sáng" },
  { meal: "LUNCH", label: "Bữa trưa" },
  { meal: "DINNER", label: "Bữa tối" },
];
type WeekProps = {
  weekStart: Date;
  todayKey: string;
  dishesFor: (key: string) => CalendarDish[];
  onOpenDay: (key: string) => void;
};

const WEEK_MEALS: Array<{ meal: MealType; short: string; label: string }> = [
  { meal: "BREAKFAST", short: "Sáng", label: "Bữa sáng" },
  { meal: "LUNCH", short: "Trưa", label: "Bữa trưa" },
  { meal: "DINNER", short: "Tối", label: "Bữa tối" },
];
/** Row heights are fixed so the grid reads like a calendar: 3 name lines + the "+N" line. */
const WEEK_HEADER_HEIGHT = 40;
const WEEK_ROW_HEIGHT = 84;
const WEEK_LABEL_WIDTH = 34;

/**
 * Theo tuần: a timetable (rows Sáng / Trưa / Tối, columns T2..CN) that fits a 360 px phone without sideways
 * scrolling: a narrow label column and 7 equal flexible columns (wider on tablets/web). Each cell shows the meal's
 * first dish (up to 3 lines) and "+N" for the others, or "—". Tapping a cell or a day header opens Theo ngày.
 */
export function WeekTimetable({ weekStart, todayKey, dishesFor, onOpenDay }: WeekProps): React.JSX.Element {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  return (
    <View style={local.week}>
      <View style={[local.weekLabels, { width: WEEK_LABEL_WIDTH }]}>
        <View style={local.weekHeader} />
        {WEEK_MEALS.map((row) => (
          <View key={row.meal} style={local.weekLabelCell}><Text style={local.weekLabel} numberOfLines={1}>{row.short}</Text></View>
        ))}
      </View>
      {days.map((date) => {
        const key = dayKey(date);
        const isToday = key === todayKey;
        const dishes = dishesFor(key);
        const dayLabel = WEEKDAY_SHORT[weekday(date) - 1];
        return (
          <View key={key} style={[local.weekColumn, isToday && local.todayCell]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem ${dayLabel} ${dayMonth(date)}${isToday ? ", hôm nay" : ""}`}
              onPress={() => onOpenDay(key)}
              style={({ pressed }) => [local.weekHeader, isToday && local.weekHeaderToday, pressed && local.pressed]}
            >
              <Text style={[local.weekHeaderText, isToday && local.weekHeaderTextToday]}>{dayLabel}</Text>
              <Text style={[local.weekHeaderText, isToday && local.weekHeaderTextToday]}>{date.getDate()}</Text>
            </Pressable>
            {WEEK_MEALS.map((row) => {
              const mealDishes = dishes.filter((dish) => dish.mealType === row.meal);
              const first = mealDishes[0];
              return (
                <Pressable
                  key={row.meal}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label} ${dayLabel} ${dayMonth(date)}: ${mealDishes.length ? mealDishes.map((dish) => dish.dishName).join(", ") : "chưa có món"}`}
                  onPress={() => onOpenDay(key)}
                  style={({ pressed }) => [local.weekCell, pressed && local.pressed]}
                >
                  <Text style={first ? local.weekDish : local.weekEmpty} numberOfLines={3}>{first?.dishName ?? "—"}</Text>
                  {mealDishes.length > 1 && <Text style={local.weekMore} numberOfLines={1}>+{mealDishes.length - 1}</Text>}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

type MonthProps = {
  anchor: Date;
  todayKey: string;
  dishesFor: (key: string) => CalendarDish[];
  onOpenDay: (key: string) => void;
};

/** Cells narrower than this show "3 món" instead of the dish names. */
const NAMES_MIN_WIDTH = 72;

/** Theo tháng: a standard month grid (T2..CN). Days outside the month are faded; tap a day for Theo ngày. */
export function MonthCalendar({ anchor, todayKey, dishesFor, onOpenDay }: MonthProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const cellWidth = width > 0 ? width / 7 : 0;
  const showNames = cellWidth >= NAMES_MIN_WIDTH;
  const days = monthGridDays(anchor);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={local.month}>
      <View style={local.monthRow}>
        {WEEKDAY_SHORT.map((label) => (
          <View key={label} style={local.monthHeadCell}><Text style={local.headerDay}>{label}</Text></View>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={dayKey(week[0])} style={local.monthRow}>
          {week.map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === anchor.getMonth();
            const isToday = key === todayKey;
            const dishes = dishesFor(key).filter((dish) => dish.mealType !== "SNACK");
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Ngày ${dayMonth(date)}${dishes.length ? `, ${dishes.length} món: ${dishes.map((dish) => dish.dishName).join(", ")}` : ", chưa có món"}`}
                onPress={() => onOpenDay(key)}
                style={({ pressed }) => [local.monthCell, !inMonth && local.outside, isToday && local.todayCell, pressed && local.pressed]}
              >
                <Text style={[local.monthDay, isToday && local.todayDay]}>{date.getDate()}</Text>
                {showNames && dishes.length <= 3
                  ? dishes.map((dish) => <Text key={dish.id} style={local.monthDish} numberOfLines={1}>{dish.dishName}</Text>)
                  : showNames
                    ? (
                      <>
                        {/* Several dishes per meal: the first dish of each meal, then the total. */}
                        {MEAL_ROWS.map((row) => dishes.find((dish) => dish.mealType === row.meal)).filter((dish): dish is CalendarDish => !!dish).slice(0, 2)
                          .map((dish) => <Text key={dish.id} style={local.monthDish} numberOfLines={1}>{dish.dishName}</Text>)}
                        <Text style={local.monthCount} numberOfLines={1}>{dishes.length} món</Text>
                      </>
                    )
                    : dishes.length > 0 && <Text style={local.monthCount} numberOfLines={1}>{dishes.length} món</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  week: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", overflow: "hidden", width: "100%" },
  weekLabels: { borderRightColor: colors.border, borderRightWidth: 1 },
  weekLabelCell: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, height: WEEK_ROW_HEIGHT, justifyContent: "center" },
  weekLabel: { ...textStyles.caption, color: colors.text, fontWeight: "600" },
  weekColumn: { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth, flex: 1, minWidth: 0 },
  weekHeader: { alignItems: "center", height: WEEK_HEADER_HEIGHT, justifyContent: "center" },
  weekHeaderToday: { backgroundColor: colors.primary },
  weekHeaderText: { ...textStyles.caption, color: colors.text, fontWeight: "700", lineHeight: 16 },
  weekHeaderTextToday: { color: colors.primaryText },
  weekCell: { borderTopColor: colors.border, borderTopWidth: 1, gap: 1, height: WEEK_ROW_HEIGHT, overflow: "hidden", paddingHorizontal: 2, paddingVertical: 3 },
  weekDish: { ...textStyles.caption, color: colors.text, lineHeight: 16 },
  weekEmpty: { ...textStyles.caption, lineHeight: 16, textAlign: "center" },
  weekMore: { ...textStyles.caption, lineHeight: 16 },
  headerDay: { ...textStyles.caption, color: colors.text, fontWeight: "700" },
  todayDay: { color: colors.primary },
  pressed: { opacity: 0.7 },
  month: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  monthRow: { flexDirection: "row" },
  monthHeadCell: { alignItems: "center", flex: 1, paddingVertical: spacing.xs },
  monthCell: { borderColor: colors.border, borderTopWidth: 1, flex: 1, gap: 2, minHeight: 84, padding: 3 },
  outside: { opacity: 0.4 },
  todayCell: { backgroundColor: colors.primarySoft },
  monthDay: { ...textStyles.caption, color: colors.text, fontWeight: "700" },
  monthDish: { ...textStyles.caption, color: colors.text },
  monthCount: { ...textStyles.caption, color: colors.primary },
});
