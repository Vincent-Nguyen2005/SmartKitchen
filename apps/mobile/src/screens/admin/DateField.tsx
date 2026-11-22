import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays, X } from "lucide-react-native";
import { AppIcon, AppText, colors, IconButton, radius, spacing, touchTarget } from "../../theme";

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

/**
 * Opens the browser's date picker when it allows it. showPicker() is missing in older browsers and throws a
 * SecurityError inside a cross-origin iframe (embedded previews); then the native input just opens as usual.
 */
const tryShowPicker = (input: HTMLInputElement & { showPicker?: () => void }) => {
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Not allowed here: keep the browser's own click / focus behaviour.
  }
};

type DateFieldProps = {
  label: string;
  /** YYYY-MM-DD, or "" for none. */
  value: string;
  onChange: (day: string) => void;
  /** Earliest selectable day, YYYY-MM-DD. */
  minDate: string;
  /** Latest selectable day, YYYY-MM-DD (e.g. today for a birth date). */
  maxDate?: string;
  /** Day the picker opens on while the field is empty (e.g. today + 7), YYYY-MM-DD. */
  suggestedDate: string;
  /** Shown under the field while it is empty. */
  emptyHint: string;
  /** "large": taller field with bigger text (onboarding wizard). */
  size?: "default" | "large";
};

/**
 * Calendar date input that always reports YYYY-MM-DD and shows dd/MM/yyyy.
 * Web: the browser's native <input type="date">. Android: the system date dialog, opened on tap.
 * iOS: the compact picker inline in the form (a small date button that expands in place), so it
 * never covers the form. Minimum date everywhere = minDate.
 */
export function DateField({ label, value, onChange, minDate, maxDate, suggestedDate, emptyHint, size = "default" }: DateFieldProps): React.JSX.Element {
  const large = size === "large";
  const textVariant = large ? "subheading" : "body";
  const pick = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "set" && date) onChange(toDay(date));
  };
  const openAndroid = () => DateTimePickerAndroid.open({
    value: toLocalDate(value || suggestedDate),
    mode: "date",
    minimumDate: toLocalDate(minDate),
    maximumDate: maxDate ? toLocalDate(maxDate) : undefined,
    onChange: pick,
  });

  const clear = value ? <IconButton icon={X} size="sm" accessibilityLabel={`Xóa ${label.toLowerCase()}`} onPress={() => onChange("")} /> : null;

  let control: React.ReactNode;
  if (Platform.OS === "web") {
    // The browser's own date input follows the browser language (mm/dd/yyyy in English), so the field shows our
    // dd/mm/yyyy text and the native input lies on top of it, invisible, to open the picker on click.
    control = (
      <View style={[local.webField, large && local.large]}>
        <View pointerEvents="none" style={[local.button, large && local.large]}>
          <AppIcon icon={CalendarDays} size={large ? "md" : "sm"} color={colors.muted} />
          <AppText variant={textVariant} color={value ? colors.text : colors.muted}>{value ? toDisplayDate(value) : "dd/mm/yyyy"}</AppText>
        </View>
        <input
          type="date"
          aria-label={value ? `${label}: ${toDisplayDate(value)}` : label}
          value={value}
          min={minDate}
          max={maxDate}
          onChange={(event) => onChange(event.currentTarget.value)}
          onClick={(event) => tryShowPicker(event.currentTarget)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0 }}
        />
      </View>
    );
  } else if (Platform.OS === "ios" && value) {
    control = (
      <View style={[local.iosPicker, large && local.large]}>
        <DateTimePicker
          value={toLocalDate(value)}
          mode="date"
          display="compact"
          minimumDate={toLocalDate(minDate)}
          maximumDate={maxDate ? toLocalDate(maxDate) : undefined}
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
        style={({ pressed }) => [local.button, large && local.large, pressed && local.pressed]}
      >
        <AppIcon icon={CalendarDays} size={large ? "md" : "sm"} color={colors.muted} />
        <AppText variant={textVariant} color={value ? colors.text : colors.muted}>{value ? toDisplayDate(value) : "Chọn ngày"}</AppText>
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
  large: { minHeight: touchTarget + spacing.lg },
  webField: { flex: 1, minHeight: touchTarget, position: "relative" },
  iosPicker: { alignItems: "flex-start", flex: 1, minHeight: touchTarget, justifyContent: "center" },
});
