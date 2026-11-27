import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type DimensionValue } from "react-native";
import { AppIcon, colors, spacing, textStyles, touchTarget, type LucideIcon } from "../theme";

/**
 * The app's top tab look (icon above the label, theme-coloured underline on the active tab), shared by the member
 * tab bar (App.tsx) and the Quản trị tab bar (AdminHome), so both have the same height and typography.
 */
export const topTabStyles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1, flexGrow: 0 },
  tab: {
    alignItems: "center",
    gap: spacing.xs,
    height: touchTarget + spacing.xl + spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  tabActive: { backgroundColor: colors.surface, borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabText: { ...textStyles.labelSmall, color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: "center" },
  tabTextActive: { color: colors.primary },
});

type TopTabButtonProps = {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
  /** Fixed width (member bar) or flex share (admin bar). */
  width?: DimensionValue;
  flex?: number;
  accessibilityLabel?: string;
  /** Drawn over the icon (e.g. the Thông báo badge). */
  iconOverlay?: React.ReactNode;
};

export function TopTabButton({ label, icon, active, onPress, width, flex, accessibilityLabel, iconOverlay }: TopTabButtonProps): React.JSX.Element {
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[topTabStyles.tab, width !== undefined && { width }, flex !== undefined && { flex, minWidth: 0 }, active && topTabStyles.tabActive]}
    >
      <View>
        <AppIcon icon={icon} size="md" color={active ? colors.primary : colors.muted} />
        {iconOverlay}
      </View>
      <Text numberOfLines={2} style={[topTabStyles.tabText, active && topTabStyles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
