import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { Check, ChevronDown, CircleExclamationPoint, Inbox, RefreshCw, Square, SquareCheck } from "lucide-react-native";
import { AppIcon, breakpoints, colors, radius, spacing, textStyles, touchTarget, typography, type LucideIcon } from "../../theme";

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

type DropdownOption<T extends string> = { value: NoInfer<T>; label: string };

type PillProps = { text: string; active: boolean; accessibilityLabel: string; onPress: () => void };

/** Dropdown trigger: same pill as a Segmented chip; filled (selected style) when a filter is applied. */
function DropdownPill({ text, active, accessibilityLabel, onPress }: PillProps): React.JSX.Element {
  const color = active ? colors.primaryText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Mở danh sách lựa chọn"
      onPress={onPress}
      style={({ pressed }) => [styles.segment, active && styles.segmentSelected, pressed && !active && styles.segmentPressed]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextSelected]} numberOfLines={1}>{text}</Text>
      <AppIcon icon={ChevronDown} size="sm" color={color} />
    </Pressable>
  );
}

type SheetProps = { title: string; visible: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode };

/** Centered option sheet over a dimmed backdrop; tapping the backdrop closes it. */
function OptionSheet({ title, visible, onClose, children, footer }: SheetProps): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Đóng danh sách" accessibilityRole="button">
        {/* Inner Pressable swallows taps so they do not reach the backdrop. */}
        <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
          <Text style={[styles.title, styles.sheetTitle]} accessibilityRole="header">{title}</Text>
          <ScrollView style={styles.sheetList}>{children}</ScrollView>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type OptionRowProps = { label: string; selected: boolean; multi?: boolean; onPress: () => void };

function OptionRow({ label, selected, multi, onPress }: OptionRowProps): React.JSX.Element {
  const icon = multi ? (selected ? SquareCheck : Square) : Check;
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.segmentPressed]}
    >
      {multi || selected ? <AppIcon icon={icon} size="sm" color={selected ? colors.primary : colors.muted} /> : <View style={styles.optionIconSpacer} />}
      <Text style={[styles.body, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

type DropdownProps<T extends string> = {
  /** Shown before the value in the pill ("Trạng thái: Mới") and as the sheet title. */
  label: string;
  value: NoInfer<T>;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** The "no filter" value; the pill is filled whenever another value is selected. */
  neutralValue?: NoInfer<T>;
};

/** Single-choice filter: a pill showing the current choice, opening a sheet of options. */
export function Dropdown<T extends string>({ label, value, options, onChange, neutralValue }: DropdownProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? "";
  return (
    <>
      <DropdownPill text={`${label}: ${current}`} active={neutralValue !== undefined && value !== neutralValue} accessibilityLabel={`${label}: ${current}`} onPress={() => setOpen(true)} />
      <OptionSheet title={label} visible={open} onClose={() => setOpen(false)}>
        {options.map((option) => (
          <OptionRow key={option.value} label={option.label} selected={option.value === value} onPress={() => { setOpen(false); onChange(option.value); }} />
        ))}
      </OptionSheet>
    </>
  );
}

type MultiDropdownProps = {
  label: string;
  /** Empty array = everything ("Tất cả"). */
  value: string[];
  options: DropdownOption<string>[];
  onChange: (value: string[]) => void;
  /** Label for "n items selected", e.g. (n) => `${n} dịch vụ`. */
  countLabel: (count: number) => string;
  allLabel?: string;
};

/**
 * Multi-choice filter. The pill reads "<label>: Tất cả", the single selected name, or countLabel(n).
 * Changes are applied with "Áp dụng" so the caller reloads once, not on every tick.
 */
export function MultiDropdown({ label, value, options, onChange, countLabel, allLabel = "Tất cả" }: MultiDropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const summary = value.length === 0 ? allLabel
    : value.length === 1 ? options.find((option) => option.value === value[0])?.label ?? value[0]
      : countLabel(value.length);
  const toggle = (item: string) => setDraft((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]));
  const apply = () => {
    setOpen(false);
    // Picking every option is the same as "Tất cả".
    onChange(draft.length === options.length ? [] : options.map((option) => option.value).filter((item) => draft.includes(item)));
  };
  return (
    <>
      <DropdownPill text={`${label}: ${summary}`} active={value.length > 0} accessibilityLabel={`${label}: ${summary}`} onPress={() => { setDraft(value); setOpen(true); }} />
      <OptionSheet
        title={label}
        visible={open}
        onClose={() => setOpen(false)}
        footer={(
          <View style={[styles.wrapRow, styles.sheetFooter]}>
            <Button variant="secondary" label="Hủy" onPress={() => setOpen(false)} />
            <Button label="Áp dụng" onPress={apply} />
          </View>
        )}
      >
        <OptionRow multi label={allLabel} selected={draft.length === 0} onPress={() => setDraft([])} />
        {options.map((option) => (
          <OptionRow multi key={option.value} label={option.label} selected={draft.includes(option.value)} onPress={() => toggle(option.value)} />
        ))}
      </OptionSheet>
    </>
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

/**
 * Page title (28, the agreed pageTitle step). Hidden on short screens (phones in landscape, height < 500)
 * so the content keeps its height; the app tab bar still names the page there.
 */
export function PageTitle({ children }: { children: string }): React.JSX.Element | null {
  const { height } = useWindowDimensions();
  if (height < breakpoints.splitMinHeight) return null;
  return (
    <View style={styles.pageTitleBlock}>
      <Text style={styles.pageTitle} accessibilityRole="header" numberOfLines={2}>{children}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  state: { alignItems: "center", gap: spacing.md, justifyContent: "center", padding: spacing.xl, minHeight: 160 },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  mutedText: { ...typography.bodySmall, color: colors.muted, textAlign: "center" },
  // Typography: the shared scale from src/theme/typography.ts (no hard-coded font sizes, minimum 12).
  pageTitle: textStyles.pageTitle,
  headline: textStyles.heading,
  title: textStyles.subheading,
  subtitle: textStyles.label,
  body: textStyles.body,
  muted: { ...typography.bodySmall, color: colors.muted },
  caption: textStyles.caption,
  success: { ...typography.body, color: colors.success },
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
  buttonText: { ...typography.label, color: colors.primaryText },
  // Segmented
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingVertical: spacing.sm },
  segment: { alignItems: "center", borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: 14, backgroundColor: colors.surface },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentPressed: { backgroundColor: colors.primarySoft },
  segmentText: { ...typography.bodySmall, color: colors.text },
  segmentTextSelected: { ...typography.labelSmall, color: colors.primaryText },
  // Dropdown sheet
  sheetBackdrop: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: "80%", maxWidth: 380, padding: spacing.lg, width: "100%" },
  sheetTitle: { marginBottom: spacing.sm },
  sheetList: { flexGrow: 0 },
  sheetFooter: { justifyContent: "flex-end", marginTop: spacing.md },
  optionRow: { alignItems: "center", borderRadius: radius.sm, flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  optionIconSpacer: { width: 16 },
  optionTextSelected: { color: colors.primary, fontWeight: "600" },
  // Fields
  field: { gap: spacing.xs, marginBottom: 10 },
  fieldLabel: { ...typography.bodySmall, color: colors.muted },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, minHeight: touchTarget, paddingHorizontal: spacing.md },
  inputWithIcon: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  // Inputs take the body size (16 also stops iOS from zooming on focus) but no lineHeight, which can clip on Android.
  inputBare: { color: colors.text, flex: 1, fontFamily: typography.body.fontFamily, fontSize: typography.body.fontSize, minHeight: touchTarget - 2, minWidth: 0 },
  // Badge
  badge: { alignItems: "center", alignSelf: "flex-start", borderRadius: radius.pill, flexDirection: "row", gap: spacing.xs, paddingHorizontal: 10, paddingVertical: spacing.xs },
  badgeText: typography.labelSmall,
  pageTitleBlock: { paddingTop: spacing.md },
});
