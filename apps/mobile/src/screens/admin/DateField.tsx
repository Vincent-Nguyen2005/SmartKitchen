import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CalendarDays, X } from "lucide-react-native";
import { AppIcon, AppText, colors, IconButton, radius, spacing, touchTarget } from "../../theme";
import { CalendarPicker } from "../../components/CalendarPicker";

/** YYYY-MM-DD -> dd/MM/yyyy ("" stays ""). */
export const toDisplayDate = (day: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
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
  /** Shown under the field while it is empty (optional). */
  emptyHint?: string;
  /** Offer clearing (the x next to the field and "Xóa" in the calendar). Default true. */
  clearable?: boolean;
  /** "large": taller field with bigger text (onboarding wizard). */
  size?: "default" | "large";
};

/**
 * Calendar date input that always reports YYYY-MM-DD and shows dd/MM/yyyy. Tapping it opens the in-app
 * CalendarPicker, the same on web, iOS and Android, so it also works inside embedded web previews.
 * Selectable days = minDate..maxDate.
 */
export function DateField({ label, value, onChange, minDate, maxDate, suggestedDate, emptyHint, clearable = true, size = "default" }: DateFieldProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const large = size === "large";
  const textVariant = large ? "subheading" : "body";

  return (
    <View style={local.block}>
      <AppText variant="bodySmall" color={colors.muted}>{label}</AppText>
      <View style={local.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={value ? `${label}: ${toDisplayDate(value)}. Đổi ngày` : `${label}: chọn ngày`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [local.button, large && local.large, pressed && local.pressed]}
        >
          <AppIcon icon={CalendarDays} size={large ? "md" : "sm"} color={colors.muted} />
          <AppText variant={textVariant} color={value ? colors.text : colors.muted}>{value ? toDisplayDate(value) : "dd/mm/yyyy"}</AppText>
        </Pressable>
        {clearable && value ? <IconButton icon={X} size="sm" accessibilityLabel={`Xóa ${label.toLowerCase()}`} onPress={() => onChange("")} /> : null}
      </View>
      {!value && emptyHint ? <AppText variant="caption">{emptyHint}</AppText> : null}
      <CalendarPicker
        visible={open}
        title={label}
        value={value}
        minDate={minDate}
        maxDate={maxDate}
        initialDate={suggestedDate}
        onCancel={() => setOpen(false)}
        onConfirm={(day) => { setOpen(false); onChange(day); }}
        onClear={clearable ? () => { setOpen(false); onChange(""); } : undefined}
      />
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
  large: { minHeight: touchTarget + spacing.lg },
  pressed: { backgroundColor: colors.primarySoft },
});
