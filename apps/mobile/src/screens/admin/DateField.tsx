import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import { AppText, colors, IconButton, radius, spacing, touchTarget, typography } from "../../theme";

/** YYYY-MM-DD -> dd/MM/yyyy ("" stays ""). */
export const toDisplayDate = (day: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

/** dd/MM/yyyy (or d/M/yyyy) -> YYYY-MM-DD, or null when it is not a real calendar date. */
export const fromDisplayDate = (text: string): string | null => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day) ? day : null;
};

type DateFieldProps = {
  label: string;
  /** YYYY-MM-DD, or "" for none. */
  value: string;
  onChange: (day: string) => void;
  /** Earliest selectable day, YYYY-MM-DD. */
  minDate: string;
  /** Shown under the field while it is empty. */
  emptyHint: string;
};

/**
 * Calendar date input that always reports YYYY-MM-DD and shows dd/MM/yyyy.
 * Web: the browser's native <input type="date"> (calendar popup, min = minDate).
 * iOS/Android: a dd/MM/yyyy text field until @react-native-community/datetimepicker is installed
 * (it is the only allowed dependency for this; install it with `npx expo install` while Expo is stopped).
 */
export function DateField({ label, value, onChange, minDate, emptyHint }: DateFieldProps): React.JSX.Element {
  const [text, setText] = useState(toDisplayDate(value));
  useEffect(() => { setText(toDisplayDate(value)); }, [value]);

  const clear = value || text ? <IconButton icon={X} size="sm" accessibilityLabel={`Xóa ${label.toLowerCase()}`} onPress={() => { setText(""); onChange(""); }} /> : null;

  return (
    <View style={local.block}>
      <AppText variant="bodySmall" color={colors.muted}>{label}</AppText>
      <View style={local.row}>
        {Platform.OS === "web" ? (
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
        ) : (
          <TextInput
            accessibilityLabel={label}
            value={text}
            placeholder="dd/mm/yyyy"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            onChangeText={(next) => {
              setText(next);
              const day = fromDisplayDate(next);
              if (day) onChange(day);
              else if (!next.trim()) onChange("");
            }}
            style={local.input}
          />
        )}
        {clear}
      </View>
      {value
        ? <AppText variant="caption">Đã chọn: {toDisplayDate(value)}</AppText>
        : text.trim() && Platform.OS !== "web" && !fromDisplayDate(text)
          ? <AppText variant="caption" color={colors.danger}>Nhập ngày dạng dd/mm/yyyy.</AppText>
          : <AppText variant="caption">{emptyHint}</AppText>}
    </View>
  );
}

const local = StyleSheet.create({
  block: { gap: spacing.xs, marginBottom: 10 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text,
    flex: 1, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, minHeight: touchTarget, paddingHorizontal: spacing.md,
  },
});
