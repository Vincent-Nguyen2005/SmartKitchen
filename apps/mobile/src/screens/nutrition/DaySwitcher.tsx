import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh, no daylight saving

/** Today's calendar day in Vietnam as YYYY-MM-DD, whatever the device time zone is. */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

/** YYYY-MM-DD plus `days` calendar days. */
export const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** "Thứ năm, 20 tháng 11" for a YYYY-MM-DD day (calendar day, no time-zone shift). */
export const formatDay = (day: string): string =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type Props = { value: string; onChange: (day: string) => void };

/**
 * "‹ Hôm nay ›" day switcher in Vietnam time. Future days are disabled; tapping the label on another day
 * jumps back to today.
 */
export function DaySwitcher({ value, onChange }: Props): React.JSX.Element {
  const today = vnToday();
  const isToday = value >= today;
  return (
    <View style={styles.bar}>
      <IconButton accessibilityLabel="Ngày trước" icon={ChevronLeft} color={colors.text} onPress={() => onChange(addDays(value, -1))} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isToday ? `Hôm nay, ${formatDay(value)}` : `${formatDay(value)}. Chạm để về hôm nay`}
        disabled={isToday}
        onPress={() => onChange(today)}
        style={styles.center}
      >
        <View style={styles.labelRow}>
          <AppIcon icon={Calendar} size="sm" color={colors.primary} />
          <Text style={styles.label}>{isToday ? "Hôm nay" : "Về hôm nay"}</Text>
        </View>
        <Text style={styles.day} numberOfLines={1}>{formatDay(value)}</Text>
      </Pressable>
      <IconButton
        accessibilityLabel="Ngày tiếp theo"
        icon={ChevronRight}
        color={colors.text}
        disabled={isToday}
        onPress={() => onChange(addDays(value, 1))}
        style={isToday ? styles.disabled : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", minHeight: touchTarget + spacing.md, paddingHorizontal: spacing.xs },
  center: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: touchTarget, minWidth: 0, paddingHorizontal: spacing.xs },
  labelRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  label: { ...textStyles.labelSmall, color: colors.primary },
  day: { ...textStyles.bodySmall, textTransform: "capitalize" },
  disabled: { opacity: 0.35 },
});
