import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

/** Shared UI for the notification and admin screens (owner: Huy). */
export const colors = {
  primary: "#2F6B5F",
  primaryText: "#FFFFFF",
  text: "#182A24",
  muted: "#65746C",
  border: "#DCE3DE",
  surface: "#FFFFFF",
  background: "#F4F7F2",
  danger: "#B42318",
  warning: "#B54708",
  success: "#067647",
  unread: "#E8F3EF",
};

/** Phones in portrait get one column; tablets and landscape get wider layouts. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 720;
  return {
    width,
    isWide,
    isLandscape: width > height,
    columns: width >= 1100 ? 3 : isWide ? 2 : 1,
    gutter: isWide ? 24 : 16,
  };
}

type StateProps = { loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; onRetry?: () => void };

/** Loading / error (with retry) / empty states. Renders nothing when there is content to show. */
export function ScreenState({ loading, error, empty, emptyText = "Chưa có dữ liệu.", onRetry }: StateProps): React.JSX.Element | null {
  if (loading) {
    return (
      <View style={styles.state} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="Đang tải" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state} accessibilityLiveRegion="assertive">
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? <Button label="Thử lại" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.state}>
        <Text style={styles.mutedText}>{emptyText}</Text>
      </View>
    );
  }
  return null;
}

type ButtonProps = { label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; busy?: boolean; accessibilityLabel?: string; style?: ViewStyle };

export function Button({ label, onPress, variant = "primary", disabled, busy, accessibilityLabel, style }: ButtonProps): React.JSX.Element {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], inactive && styles.disabled, pressed && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator color={variant === "secondary" ? colors.primary : colors.primaryText} /> : (
        <Text style={[styles.buttonText, variant === "secondary" && styles.secondaryText]}>{label}</Text>
      )}
    </Pressable>
  );
}

// T is inferred from onChange (the state setter), so option literals cannot widen it to string.
type SegmentProps<T extends string> = { value: NoInfer<T>; options: { value: NoInfer<T>; label: string }[]; onChange: (value: T) => void; label: string };

/** Horizontal tab-like selector; wraps on narrow screens. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentProps<T>): React.JSX.Element {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  state: { alignItems: "center", gap: 12, justifyContent: "center", padding: 24, minHeight: 160 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center" },
  mutedText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 14 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { alignItems: "center", borderRadius: 10, justifyContent: "center", minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
  secondaryText: { color: colors.primary },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  segment: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: "center", paddingHorizontal: 14 },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.text, fontSize: 14 },
  segmentTextSelected: { color: colors.primaryText, fontWeight: "600" },
  field: { gap: 4, marginBottom: 10 },
  fieldLabel: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 44, paddingHorizontal: 12 },
});
