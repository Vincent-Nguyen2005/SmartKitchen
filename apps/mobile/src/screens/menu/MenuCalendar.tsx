import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
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
const LABEL_WIDTH = 76;
const MIN_DAY_WIDTH = 92;
const HEADER_HEIGHT = 48;
const ROW_HEIGHT = 64;

type WeekProps = {
  weekStart: Date;
  todayKey: string;
  dishesFor: (key: string) => CalendarDish[];
  onOpenDay: (key: string) => void;
};

/**
 * Theo tuần: a timetable. Rows are the meals (sticky labels on the left), columns the 7 days; narrow phones
 * scroll the day columns sideways. Tapping a cell or a day header opens Theo ngày for that date.
 */
export function WeekTimetable({ weekStart, todayKey, dishesFor, onOpenDay }: WeekProps): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dayWidth = width > 0 ? Math.max(MIN_DAY_WIDTH, Math.floor((width - LABEL_WIDTH) / 7)) : MIN_DAY_WIDTH;
  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={local.table}>
      <View style={[local.labelColumn, { width: LABEL_WIDTH }]}>
        <View style={[local.headerCell, local.corner]} />
        {MEAL_ROWS.map((row) => (
          <View key={row.meal} style={local.labelCell}><Text style={local.labelText}>{row.label}</Text></View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.dayColumns}>
        {days.map((date) => {
          const key = dayKey(date);
          const isToday = key === todayKey;
          const dishes = dishesFor(key);
          return (
            <View key={key} style={[local.dayColumn, { width: dayWidth }, isToday && local.todayColumn]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Xem ngày ${WEEKDAY_SHORT[weekday(date) - 1]} ${dayMonth(date)}`} onPress={() => onOpenDay(key)} style={[local.headerCell, isToday && local.todayHeader]}>
                <Text style={[local.headerDay, isToday && local.todayText]}>{WEEKDAY_SHORT[weekday(date) - 1]}</Text>
                <Text style={[local.headerDate, isToday && local.todayText]}>{dayMonth(date)}</Text>
              </Pressable>
              {MEAL_ROWS.map((row) => {
                const dish = dishes.find((entry) => entry.mealType === row.meal);
                return (
                  <Pressable key={row.meal} accessibilityRole="button" accessibilityLabel={`${row.label} ${dayMonth(date)}: ${dish?.dishName ?? "chưa có món"}`} onPress={() => onOpenDay(key)} style={({ pressed }) => [local.cell, pressed && local.pressed]}>
                    <Text style={dish ? local.cellText : local.emptyCell} numberOfLines={2}>{dish?.dishName ?? "—"}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
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
                {showNames
                  ? dishes.slice(0, 3).map((dish) => <Text key={dish.id} style={local.monthDish} numberOfLines={1}>{dish.dishName}</Text>)
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
  table: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", overflow: "hidden" },
  labelColumn: { borderRightColor: colors.border, borderRightWidth: 1 },
  corner: { backgroundColor: colors.background },
  labelCell: { borderTopColor: colors.border, borderTopWidth: 1, height: ROW_HEIGHT, justifyContent: "center", paddingHorizontal: spacing.xs },
  labelText: { ...textStyles.caption, color: colors.text, fontWeight: "600" },
  dayColumns: { flexDirection: "row" },
  dayColumn: { borderLeftColor: colors.border, borderLeftWidth: 1 },
  todayColumn: { backgroundColor: colors.primarySoft },
  headerCell: { alignItems: "center", height: HEADER_HEIGHT, justifyContent: "center" },
  todayHeader: { backgroundColor: colors.primary },
  headerDay: { ...textStyles.caption, color: colors.text, fontWeight: "700" },
  headerDate: { ...textStyles.caption },
  todayText: { color: colors.primaryText },
  todayDay: { color: colors.primary },
  cell: { borderTopColor: colors.border, borderTopWidth: 1, height: ROW_HEIGHT, justifyContent: "center", paddingHorizontal: spacing.xs },
  cellText: { ...textStyles.caption, color: colors.text },
  emptyCell: { ...textStyles.caption, textAlign: "center" },
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
