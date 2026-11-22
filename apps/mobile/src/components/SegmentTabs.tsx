import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, colors, radius, spacing, touchTarget } from "../theme";

type Props<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
};

/** Full-width segmented tabs (Lịch: Theo ngày / Theo tuần / Theo tháng; Nấu ăn: Bữa sáng / Bữa trưa / Bữa tối). */
export function SegmentTabs<T extends string>({ options, value, onChange }: Props<T>): React.JSX.Element {
  return (
    <View accessibilityRole="tablist" style={local.tabs}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[local.tab, selected && local.tabSelected]}
          >
            <AppText variant="labelSmall" color={selected ? colors.primaryText : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  tabs: { backgroundColor: colors.border, borderRadius: radius.sm, flexDirection: "row", gap: 2, marginBottom: spacing.md, padding: 3 },
  tab: { alignItems: "center", borderRadius: radius.sm, flex: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xs },
  tabSelected: { backgroundColor: colors.primary },
});
