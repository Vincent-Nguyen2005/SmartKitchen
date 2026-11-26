import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ShoppingCart, X } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../theme";
import { selectedCountText, type SelectionBarState } from "../screens/shopping-cart/selectionBar";

/** Same height as the capture bar it replaces (72 px actions + its vertical padding + top border). */
export const BOTTOM_BAR_MIN_HEIGHT = 72;

/**
 * Đi chợ selection mode, in place of the capture bar: ✕ (leave), "<N> đã chọn" on one line, and "Thêm vào giỏ"
 * (dimmed and disabled when nothing can be added). Rendered by App.tsx from the marketSelectionBar store.
 */
export function SelectionBar({ state, onExit, onAdd }: { state: SelectionBarState; onExit: () => void; onAdd: () => void }): React.JSX.Element {
  const disabled = !state.canAdd || state.busy;
  return (
    <View style={styles.bar}>
      <IconButton icon={X} accessibilityLabel="Bỏ chọn" onPress={onExit} disabled={state.busy} />
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.count}>{selectedCountText(state.count)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Thêm vào giỏ"
        accessibilityState={{ busy: state.busy, disabled }}
        disabled={disabled}
        onPress={onAdd}
        style={({ pressed }) => [styles.button, disabled && styles.dimmed, pressed && !disabled && styles.pressed]}
      >
        {state.busy ? <ActivityIndicator color={colors.primaryText} /> : (
          <>
            <AppIcon icon={ShoppingCart} size="sm" color={colors.primaryText} />
            <Text numberOfLines={1} style={styles.buttonText}>Thêm vào giỏ</Text>
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
  dimmed: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
