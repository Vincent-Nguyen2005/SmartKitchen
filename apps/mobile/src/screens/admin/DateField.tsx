import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays, X } from "lucide-react-native";
import { AppIcon, AppText, colors, IconButton, radius, spacing, touchTarget, typography } from "../../theme";

/** YYYY-MM-DD -> dd/MM/yyyy ("" stays ""). */
export const toDisplayDate = (day: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

const pad = (value: number) => String(value).padStart(2, "0");
/** Device-local calendar day of a picker Date, as YYYY-MM-DD. */
const toDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** YYYY-MM-DD -> local Date at midnight (what the native picker shows and compares). */
const toLocalDate = (day: string): Date => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

type DateFieldProps = {
  label: string;
  /** YYYY-MM-DD, or "" for none. */
  value: string;
  onChange: (day: string) => void;
  /** Earliest selectable day, YYYY-MM-DD. */
  minDate: string;
  /** Day the picker opens on while the field is empty (e.g. today + 7), YYYY-MM-DD. */
  suggestedDate: string;
  /** Shown under the field while it is empty. */
  emptyHint: string;
};

/**
 * Calendar date input that always reports YYYY-MM-DD and shows dd/MM/yyyy.
 * Web: the browser's native <input type="date">. Android: the system date dialog, opened on tap.
 * iOS: the compact picker inline in the form (a small date button that expands in place), so it
 * never covers the form. Minimum date everywhere = minDate.
 */
export function DateField({ label, value, onChange, minDate, suggestedDate, emptyHint }: DateFieldProps): React.JSX.Element {
  const pick = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "set" && date) onChange(toDay(date));
  };
  const openAndroid = () => DateTimePickerAndroid.open({
    value: toLocalDate(value || suggestedDate),
    mode: "date",
    minimumDate: toLocalDate(minDate),
    onChange: pick,
  });

  const clear = value ? <IconButton icon={X} size="sm" accessibilityLabel={`Xóa ${label.toLowerCase()}`} onPress={() => onChange("")} /> : null;

  let control: React.ReactNode;
  if (Platform.OS === "web") {
    control = (
      <input
        type="date"
        aria-label={label}
        value={value}
        min={minDate}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          flex: 1, minHeight: touchTarget, padding: `0 ${spacing.md}px`, borderRadius: radius.sm,
          border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text,
          fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize,
        }}
      />
    );
  } else if (Platform.OS === "ios" && value) {
    control = (
      <View style={local.iosPicker}>
        <DateTimePicker
          value={toLocalDate(value)}
          mode="date"
          display="compact"
          minimumDate={toLocalDate(minDate)}
          onChange={pick}
          accessibilityLabel={label}
        />
      </View>
    );
  } else {
    // Android always, and iOS while empty: a field-like button. Android opens the dialog; on iOS the first
    // tap fills the suggested day so the inline compact picker appears in place.
    control = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${toDisplayDate(value)}. Đổi ngày` : `${label}: chọn ngày`}
        onPress={() => (Platform.OS === "android" ? openAndroid() : onChange(suggestedDate))}
        style={({ pressed }) => [local.button, pressed && local.pressed]}
      >
        <AppIcon icon={CalendarDays} size="sm" color={colors.muted} />
        <AppText variant="body" color={value ? colors.text : colors.muted}>{value ? toDisplayDate(value) : "Chọn ngày"}</AppText>
      </Pressable>
    );
  }

  return (
    <View style={local.block}>
      <AppText variant="bodySmall" color={colors.muted}>{label}</AppText>
      <View style={local.row}>
        {control}
        {clear}
      </View>
      {value ? <AppText variant="caption">Đã chọn: {toDisplayDate(value)}</AppText> : <AppText variant="caption">{emptyHint}</AppText>}
    </View>
  );
}

const local = StyleSheet.create({
  block: { gap: spacing.xs, marginBottom: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  button: {
    alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1,
    flex: 1, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md,
  },
  pressed: { backgroundColor: colors.primarySoft },
  iosPicker: { alignItems: "flex-start", flex: 1, minHeight: touchTarget, justifyContent: "center" },
});
