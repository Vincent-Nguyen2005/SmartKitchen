import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ShoppingCart, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../theme";
import { selectedCountText, type SelectionBarState } from "../screens/shopping-cart/selectionBar";

/** Same height as the capture bar it replaces (72 px actions + its vertical padding + top border). */
export const BOTTOM_BAR_MIN_HEIGHT = 72;

type Props = {
  state: SelectionBarState;
  onExit: () => void;
  onAdd: () => void;
  /** The action button; Đi chợ: "Thêm vào giỏ" (default), Thông báo: "Xóa" (destructive). */
  actionLabel?: string;
  actionIcon?: LucideIcon;
  destructive?: boolean;
};

/**
 * Selection mode bar, in place of the capture bar: ✕ (leave), "<N> đã chọn" on one line, and the action ("Thêm vào
 * giỏ" in Đi chợ, "Xóa" in Thông báo), dimmed and disabled when it cannot run. Rendered by App.tsx from the
 * marketSelectionBar / notificationSelectionBar stores.
 */
export function SelectionBar({ state, onExit, onAdd, actionLabel = "Thêm vào giỏ", actionIcon = ShoppingCart, destructive = false }: Props): React.JSX.Element {
  const disabled = !state.canAdd || state.busy;
  return (
    <View style={styles.bar}>
      <IconButton icon={X} accessibilityLabel="Bỏ chọn" onPress={onExit} disabled={state.busy} />
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.count}>{selectedCountText(state.count)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ busy: state.busy, disabled }}
        disabled={disabled}
        onPress={onAdd}
        style={({ pressed }) => [styles.button, destructive && styles.destructive, disabled && styles.dimmed, pressed && !disabled && styles.pressed]}
      >
        {state.busy ? <ActivityIndicator color={colors.primaryText} /> : (
          <>
            <AppIcon icon={actionIcon} size="sm" color={colors.primaryText} />
            <Text numberOfLines={1} style={styles.buttonText}>{actionLabel}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: BOTTOM_BAR_MIN_HEIGHT + spacing.xs * 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  count: { ...textStyles.label, color: colors.text, flex: 1, minWidth: 0 },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  buttonText: { ...textStyles.label, color: colors.primaryText },
  destructive: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
