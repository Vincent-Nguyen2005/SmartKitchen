import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { CircleExclamationPoint, Inbox, RefreshCw } from "lucide-react-native";
import { AppIcon, breakpoints, colors, fontSize, radius, spacing, touchTarget, type LucideIcon } from "../../theme";

/** Shared UI for the notification and admin screens (owner: Huy). Tokens live in src/theme. */
export { colors };

/**
 * Phones in portrait get one column; tablets and landscape get wider layouts.
 * `isSplit` (list + detail side by side) also needs enough height, so a phone in landscape
 * keeps the single-pane layout instead of squeezing the list.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= breakpoints.wide;
  return {
    width,
    height,
    isWide,
    isLandscape: width > height,
    isSplit: isWide && height >= breakpoints.splitMinHeight,
    columns: width >= breakpoints.extraWide ? 3 : isWide ? 2 : 1,
    gutter: isWide ? spacing.xl : spacing.lg,
  };
}

/**
 * Measures a grid container and returns the width of one cell, so cards share the row evenly
 * and a lone last card does not stretch across the whole row. Undefined until measured.
 */
export function useGridCell(columns: number, gap: number = spacing.md) {
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width), []);
  const cellWidth = columns > 1 && containerWidth > 0 ? Math.floor((containerWidth - gap * (columns - 1)) / columns) : undefined;
  return { onLayout, cellWidth, gap };
}

type StateProps = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  emptyIcon?: LucideIcon;
  onRetry?: () => void;
};

/** Loading / error (with retry) / empty states. Renders nothing when there is content to show. */
export function ScreenState({ loading, error, empty, emptyText = "Chưa có dữ liệu.", emptyIcon = Inbox, onRetry }: StateProps): React.JSX.Element | null {
  if (loading) {
    return (
      <View style={styles.state} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải" />
        <Text style={styles.mutedText}>Đang tải…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state} accessibilityLiveRegion="assertive">
        <AppIcon icon={CircleExclamationPoint} size="xl" color={colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? <Button label="Thử lại" icon={RefreshCw} onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.state}>
        <AppIcon icon={emptyIcon} size="xl" color={colors.muted} />
        <Text style={styles.mutedText}>{emptyText}</Text>
      </View>
    );
  }
  return null;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = "primary", icon, disabled, busy, accessibilityLabel, style }: ButtonProps): React.JSX.Element {
  const inactive = disabled || busy;
  const textColor = variant === "secondary" ? colors.primary : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], inactive && styles.disabled, pressed && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator color={textColor} /> : (
        <View style={styles.row}>
          {icon ? <AppIcon icon={icon} size="sm" color={textColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

// T is inferred from onChange (the state setter), so option literals cannot widen it to string.
type SegmentOption<T extends string> = { value: NoInfer<T>; label: string; icon?: LucideIcon };
type SegmentProps<T extends string> = { value: NoInfer<T>; options: SegmentOption<T>[]; onChange: (value: T) => void; label: string };

/** Horizontal tab-like selector; wraps on narrow screens. Each segment is at least 44 dp tall. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentProps<T>): React.JSX.Element {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        const color = selected ? colors.primaryText : colors.text;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && !selected && styles.segmentPressed]}
          >
            {option.icon ? <AppIcon icon={option.icon} size="sm" color={color} /> : null}
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; icon?: LucideIcon };

/** Labelled text input; `icon` adds a decorative leading icon (e.g. Search). */
export function Field({ label, icon, style, ...props }: FieldProps): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {icon ? (
        <View style={[styles.input, styles.inputWithIcon]}>
          <AppIcon icon={icon} size="sm" color={colors.muted} />
          <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.inputBare, style]} {...props} />
        </View>
      ) : (
        <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[styles.input, style]} {...props} />
      )}
    </View>
  );
}

type BadgeProps = { label: string; color: string; background: string; icon?: LucideIcon };

/** Small status pill: icon + text, so state never relies on colour alone. */
export function Badge({ label, color, background, icon }: BadgeProps): React.JSX.Element {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      {icon ? <AppIcon icon={icon} size="sm" color={color} /> : null}
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  state: { alignItems: "center", gap: spacing.md, justifyContent: "center", padding: spacing.xl, minHeight: 160 },
  errorText: { color: colors.danger, fontSize: fontSize.body, textAlign: "center" },
  mutedText: { color: colors.muted, fontSize: fontSize.small, textAlign: "center" },
  // Typography
  headline: { color: colors.text, fontSize: fontSize.headline, fontWeight: "700" },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: "700" },
  subtitle: { color: colors.text, fontSize: fontSize.subtitle, fontWeight: "600" },
  body: { color: colors.text, fontSize: fontSize.body, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: fontSize.small, lineHeight: 20 },
  caption: { color: colors.muted, fontSize: fontSize.caption },
  success: { color: colors.success, fontSize: fontSize.body },
  // Containers
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: 14 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  spaceBetween: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Buttons
  button: { alignItems: "center", borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.primaryText, fontSize: fontSize.body, fontWeight: "600" },
  // Segmented
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingVertical: spacing.sm },
  segment: { alignItems: "center", borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: 14, backgroundColor: colors.surface },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentPressed: { backgroundColor: colors.primarySoft },
  segmentText: { color: colors.text, fontSize: fontSize.small },
  segmentTextSelected: { color: colors.primaryText, fontWeight: "600" },
  // Fields
  field: { gap: spacing.xs, marginBottom: 10 },
  fieldLabel: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: fontSize.body, minHeight: touchTarget, paddingHorizontal: spacing.md },
  inputWithIcon: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  inputBare: { color: colors.text, flex: 1, fontSize: fontSize.body, minHeight: touchTarget - 2, minWidth: 0 },
  // Badge
  badge: { alignItems: "center", alignSelf: "flex-start", borderRadius: radius.pill, flexDirection: "row", gap: spacing.xs, paddingHorizontal: 10, paddingVertical: spacing.xs },
  badgeText: { fontSize: 13, fontWeight: "600" },
});
