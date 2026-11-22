import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import type { Gender } from "./nutritionProfileApi";

/** U+FE0E asks for the text (not emoji) form of the symbol, so it takes the theme colour on every platform. */
const OPTIONS: ReadonlyArray<{ value: Gender; symbol: string; label: string }> = [
  { value: "MALE", symbol: "♂︎", label: "Nam" },
  { value: "FEMALE", symbol: "♀︎", label: "Nữ" },
];

type Props = {
  value: Gender | null;
  onChange: (gender: Gender) => void;
  /** "large": taller tiles (onboarding step 1). */
  size?: "default" | "large";
};

/** Gender as two tiles: ♂ / ♀ as the main content with a small "Nam" / "Nữ" caption (Hồ sơ and onboarding). */
export function GenderTiles({ value, onChange, size = "default" }: Props): React.JSX.Element {
  return (
    <View accessibilityRole="radiogroup" style={local.row}>
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [local.tile, size === "large" && local.large, selected && local.selected, pressed && local.pressed]}
          >
            <Text style={[local.symbol, selected && local.selectedText]}>{option.symbol}</Text>
            <Text style={[local.caption, selected && local.selectedText]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  tile: {
    alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 2,
    flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: touchTarget * 2, paddingVertical: spacing.sm,
  },
  large: { minHeight: touchTarget * 3 + spacing.xl },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  symbol: { ...textStyles.pageTitle, color: colors.text },
  caption: { ...textStyles.labelSmall, color: colors.muted },
  selectedText: { color: colors.primary },
  pressed: { opacity: 0.82 },
});
