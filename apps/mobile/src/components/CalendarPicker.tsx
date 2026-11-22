import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../theme";

type View3 = "days" | "months" | "years";

type Props = {
  visible: boolean;
  title: string;
  /** Selected day YYYY-MM-DD, or "". */
  value: string;
  /** Earliest / latest selectable day, YYYY-MM-DD. */
  minDate: string;
  maxDate?: string;
  /** Month shown while value is empty, YYYY-MM-DD. */
  initialDate: string;
  /** While value is empty, open on the year list (birth dates) instead of the month grid. */
  startWithYears?: boolean;
  onCancel: () => void;
  onConfirm: (day: string) => void;
  /** Shows "Xóa" while a value is set. */
  onClear?: () => void;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const YEAR_ROW = touchTarget;
/** Fields without a max date (expiry, promotions) can pick up to this many years ahead. */
const YEARS_AHEAD = 10;

const pad = (value: number) => String(value).padStart(2, "0");
const dayOf = (year: number, month: number, date: number) => `${year}-${pad(month + 1)}-${pad(date)}`;
const parts = (day: string) => {
  const [year, month] = day.split("-").map(Number);
  return { year, month: month - 1 };
};
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const todayDay = () => {
  const now = new Date();
  return dayOf(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * In-app calendar in a modal (pure React Native, the same on web, iOS and Android): month grid T2..CN with today
 * marked and min/max respected, ‹ › for months, and the month / year labels open a 12-month grid and a year list
 * (newest first, the current year centred). "Hủy", "Chọn" and, when clearing is allowed, "Xóa".
 */
export function CalendarPicker({ visible, title, value, minDate, maxDate, initialDate, startWithYears, onCancel, onConfirm, onClear }: Props): React.JSX.Element {
  const [view, setView] = useState<View3>("days");
  const [cursor, setCursor] = useState(() => parts(value || initialDate));
  const [draft, setDraft] = useState(value);
  const yearScroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!visible) return;
    setCursor(parts(value || initialDate));
    setDraft(value);
    setView(!value && startWithYears ? "years" : "days");
  }, [visible]);

  const today = todayDay();
  const minYear = parts(minDate).year;
  const maxYear = maxDate ? parts(maxDate).year : Math.max(parts(today).year + YEARS_AHEAD, cursor.year);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
  const inRange = (day: string) => day >= minDate && (!maxDate || day <= maxDate);
  const monthOpen = (year: number, month: number) =>
    dayOf(year, month, daysIn(year, month)) >= minDate && (!maxDate || dayOf(year, month, 1) <= maxDate);

  const shift = (delta: number) => {
    const date = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
  };
  const prevOpen = monthOpen(new Date(cursor.year, cursor.month - 1, 1).getFullYear(), new Date(cursor.year, cursor.month - 1, 1).getMonth());
  const nextOpen = monthOpen(new Date(cursor.year, cursor.month + 1, 1).getFullYear(), new Date(cursor.year, cursor.month + 1, 1).getMonth());

  const pickYear = (year: number) => {
    // Keep the month when it is still selectable in that year, otherwise the first one that is.
    const month = monthOpen(year, cursor.month) ? cursor.month : Array.from({ length: 12 }, (_, m) => m).find((m) => monthOpen(year, m)) ?? 0;
    setCursor({ year, month });
    setView("months");
  };
  const pickMonth = (month: number) => {
    setCursor({ ...cursor, month });
    setView("days");
  };

  /** List height, from onLayout; centring runs again once the rows exist (onContentSizeChange). */
  const yearListHeight = useRef(0);
  const centreYears = () => {
    const index = Math.max(0, years.indexOf(cursor.year));
    const height = yearListHeight.current;
    yearScroll.current?.scrollTo({ y: Math.max(0, index * YEAR_ROW - (height - YEAR_ROW) / 2), animated: false });
  };

  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysIn(cursor.year, cursor.month) }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={local.overlay}>
        <Pressable accessibilityLabel="Đóng lịch" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={local.card}>
          <Text style={local.title}>{title}</Text>
          <View style={local.header}>
            {view === "days" ? (
              <IconButton icon={ChevronLeft} accessibilityLabel="Tháng trước" disabled={!prevOpen} color={prevOpen ? colors.text : colors.border} onPress={() => shift(-1)} />
            ) : <View style={local.arrowSpacer} />}
            <View style={local.headerLabels}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Tháng ${cursor.month + 1}, chọn tháng`} onPress={() => setView(view === "months" ? "days" : "months")} style={[local.headerChip, view === "months" && local.headerChipActive]}>
                <Text style={local.headerText}>Tháng {cursor.month + 1}</Text>
                <AppIcon icon={ChevronDown} size="sm" color={colors.muted} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Năm ${cursor.year}, chọn năm`} onPress={() => setView(view === "years" ? "days" : "years")} style={[local.headerChip, view === "years" && local.headerChipActive]}>
                <Text style={local.headerText}>{cursor.year}</Text>
                <AppIcon icon={ChevronDown} size="sm" color={colors.muted} />
              </Pressable>
            </View>
            {view === "days" ? (
              <IconButton icon={ChevronRight} accessibilityLabel="Tháng sau" disabled={!nextOpen} color={nextOpen ? colors.text : colors.border} onPress={() => shift(1)} />
            ) : <View style={local.arrowSpacer} />}
          </View>

          <View style={local.body}>
            {view === "days" && (
              <>
                <View style={local.row}>
                  {WEEKDAYS.map((weekday) => <Text key={weekday} style={[local.cell, local.weekday]}>{weekday}</Text>)}
                </View>
                <View style={local.grid}>
                  {cells.map((date, index) => {
                    if (date === null) return <View key={`e${index}`} style={local.cell} />;
                    const day = dayOf(cursor.year, cursor.month, date);
                    const enabled = inRange(day);
                    const selected = day === draft;
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="button"
                        accessibilityLabel={`${pad(date)}/${pad(cursor.month + 1)}/${cursor.year}`}
                        accessibilityState={{ selected, disabled: !enabled }}
                        disabled={!enabled}
                        onPress={() => setDraft(day)}
                        style={local.cell}
                      >
                        <View style={[local.dayDot, day === today && local.today, selected && local.selected]}>
                          <Text style={[local.dayText, !enabled && local.faded, selected && local.selectedText]}>{date}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {view === "months" && (
              <View style={local.monthGrid}>
                {Array.from({ length: 12 }, (_, month) => {
                  const enabled = monthOpen(cursor.year, month);
                  const selected = month === cursor.month;
                  return (
                    <Pressable
                      key={month}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !enabled }}
                      disabled={!enabled}
                      onPress={() => pickMonth(month)}
                      style={[local.monthCell, selected && local.selected]}
                    >
                      <Text style={[local.dayText, !enabled && local.faded, selected && local.selectedText]}>Tháng {month + 1}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {view === "years" && (
              <ScrollView
                ref={yearScroll}
                style={local.yearList}
                onLayout={(event) => { yearListHeight.current = event.nativeEvent.layout.height; centreYears(); }}
                onContentSizeChange={centreYears}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                {years.map((year) => {
                  const selected = year === cursor.year;
                  return (
                    <Pressable
                      key={year}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => pickYear(year)}
                      style={[local.yearRow, selected && local.selected]}
                    >
                      <Text style={[local.yearText, selected && local.selectedText]}>{year}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={local.actions}>
            {onClear && value ? (
              <Pressable accessibilityRole="button" onPress={onClear} style={({ pressed }) => [local.textButton, pressed && local.pressed]}>
                <Text style={local.dangerText}>Xóa</Text>
              </Pressable>
            ) : null}
            <View style={local.flex} />
            <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [local.textButton, pressed && local.pressed]}>
              <Text style={local.cancelText}>Hủy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !draft || !inRange(draft) }}
              disabled={!draft || !inRange(draft)}
              onPress={() => onConfirm(draft)}
              style={({ pressed }) => [local.confirmButton, pressed && local.pressed, (!draft || !inRange(draft)) && local.disabled]}
            >
              <Text style={local.confirmText}>Chọn</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  overlay: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm, maxWidth: 380, padding: spacing.lg, width: "100%" },
  title: { ...textStyles.labelSmall, color: colors.muted },
  header: { alignItems: "center", flexDirection: "row" },
  headerLabels: { flex: 1, flexDirection: "row", gap: spacing.xs, justifyContent: "center" },
  headerChip: { alignItems: "center", borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  headerChipActive: { backgroundColor: colors.primarySoft },
  headerText: { ...textStyles.subheading },
  arrowSpacer: { width: touchTarget },
  /** Same height in every view, so the card does not jump. */
  body: { height: touchTarget * 7 },
  row: { flexDirection: "row" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { alignItems: "center", height: touchTarget, justifyContent: "center", width: `${100 / 7}%` },
  weekday: { ...textStyles.caption, color: colors.muted, height: "auto", paddingVertical: spacing.xs, textAlign: "center" },
  dayDot: { alignItems: "center", borderRadius: radius.pill, height: touchTarget - spacing.xs, justifyContent: "center", width: touchTarget - spacing.xs },
  today: { borderColor: colors.primary, borderWidth: 1 },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { ...textStyles.body, textAlign: "center" },
  selectedText: { color: colors.primaryText },
  faded: { color: colors.border },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.sm },
  monthCell: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget + spacing.sm, width: "31%" },
  yearList: { flex: 1 },
  yearRow: { alignItems: "center", borderRadius: radius.sm, height: YEAR_ROW, justifyContent: "center" },
  yearText: { ...textStyles.subheading },
  actions: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  textButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  cancelText: { ...textStyles.label, color: colors.muted },
  dangerText: { ...textStyles.label, color: colors.danger },
  confirmButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
  confirmText: { ...textStyles.label, color: colors.primaryText },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
});
