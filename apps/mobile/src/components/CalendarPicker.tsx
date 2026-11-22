import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors, IconButton, radius, spacing, textStyles, touchTarget } from "../theme";

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
  onCancel: () => void;
  onConfirm: (day: string) => void;
  /** Shows "Xóa" while a value is set. */
  onClear?: () => void;
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
 * marked, days outside min/max faded, ‹ "Tháng N YYYY" › to change month. "Hủy", "Chọn" and, when clearing is
 * allowed, "Xóa".
 */
export function CalendarPicker({ visible, title, value, minDate, maxDate, initialDate, onCancel, onConfirm, onClear }: Props): React.JSX.Element {
  const [cursor, setCursor] = useState(() => parts(value || initialDate));
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setCursor(parts(value || initialDate));
    setDraft(value);
  }, [visible]);

  const today = todayDay();
  const inRange = (day: string) => day >= minDate && (!maxDate || day <= maxDate);
  /** The month at `delta` from the cursor, and whether any of its days is selectable. */
  const monthAt = (delta: number) => {
    const date = new Date(cursor.year, cursor.month + delta, 1);
    const year = date.getFullYear();
    const month = date.getMonth();
    const open = dayOf(year, month, daysIn(year, month)) >= minDate && (!maxDate || dayOf(year, month, 1) <= maxDate);
    return { year, month, open };
  };
  const prev = monthAt(-1);
  const next = monthAt(1);

  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysIn(cursor.year, cursor.month) }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const canConfirm = !!draft && inRange(draft);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={local.overlay}>
        <Pressable accessibilityLabel="Đóng lịch" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={local.card}>
          <Text style={local.title}>{title}</Text>
          <View style={local.header}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Tháng trước" disabled={!prev.open} color={prev.open ? colors.text : colors.border} onPress={() => setCursor({ year: prev.year, month: prev.month })} />
            <Text accessibilityRole="header" style={local.headerText}>Tháng {cursor.month + 1} {cursor.year}</Text>
            <IconButton icon={ChevronRight} accessibilityLabel="Tháng sau" disabled={!next.open} color={next.open ? colors.text : colors.border} onPress={() => setCursor({ year: next.year, month: next.month })} />
          </View>

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
              accessibilityState={{ disabled: !canConfirm }}
              disabled={!canConfirm}
              onPress={() => onConfirm(draft)}
              style={({ pressed }) => [local.confirmButton, pressed && local.pressed, !canConfirm && local.disabled]}
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
  headerText: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  row: { flexDirection: "row" },
  /** Six week rows always, so the card keeps its height between months. */
  grid: { flexDirection: "row", flexWrap: "wrap", minHeight: touchTarget * 6 },
  cell: { alignItems: "center", height: touchTarget, justifyContent: "center", width: `${100 / 7}%` },
  weekday: { ...textStyles.caption, color: colors.muted, height: "auto", paddingVertical: spacing.xs, textAlign: "center" },
  dayDot: { alignItems: "center", borderRadius: radius.pill, height: touchTarget - spacing.xs, justifyContent: "center", width: touchTarget - spacing.xs },
  today: { borderColor: colors.primary, borderWidth: 1 },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { ...textStyles.body, textAlign: "center" },
  selectedText: { color: colors.primaryText },
  faded: { color: colors.border },
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
