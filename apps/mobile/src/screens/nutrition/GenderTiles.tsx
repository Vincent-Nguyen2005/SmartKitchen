import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Mars, Venus } from "lucide-react-native";
import { colors, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import type { Gender } from "./nutritionProfileApi";

/** Lucide Mars / Venus icons (clearer than the ♂ / ♀ text symbols): about 44 px with a heavier stroke. */
const OPTIONS: ReadonlyArray<{ value: Gender; icon: LucideIcon; label: string }> = [
  { value: "MALE", icon: Mars, label: "Nam" },
  { value: "FEMALE", icon: Venus, label: "Nữ" },
];
const SYMBOL_SIZE = touchTarget;
const SYMBOL_STROKE = 2.5;

type Props = {
  value: Gender | null;
  onChange: (gender: Gender) => void;
  /** "large": taller tiles (onboarding step 1). */
  size?: "default" | "large";
};

/** Gender as two tiles: the Mars / Venus icon as the main content with a small "Nam" / "Nữ" caption (Hồ sơ and onboarding). */
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
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
              <option.icon size={SYMBOL_SIZE} strokeWidth={SYMBOL_STROKE} color={selected ? colors.primary : colors.text} />
            </View>
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
  caption: { ...textStyles.labelSmall, color: colors.muted },
  selectedText: { color: colors.primary },
  pressed: { opacity: 0.82 },
});
