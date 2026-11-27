import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppIcon, colors, spacing, textStyles, type LucideIcon } from "../theme";

export type CaptureBarAction<K extends string> = { key: K; label: string; icon: LucideIcon; primary?: boolean; active?: boolean };

/**
 * The bottom action bar: three actions with an icon in a soft circle above the label; the primary one (centre) is a
 * bigger filled circle. Users: Chụp ảnh · QR gia đình · Chi tiêu (App.tsx); admins: Chụp ảnh · Đơn hàng · Doanh thu
 * (AdminHome). Rendered after the content, so it never covers it.
 */
export function CaptureBar<K extends string>({ actions, onPress }: { actions: ReadonlyArray<CaptureBarAction<K>>; onPress: (key: K) => void }): React.JSX.Element {
  return (
    <View style={local.bar}>
      {actions.map(({ key, label, icon, primary, active }) => (
        <TouchableOpacity key={key} accessibilityLabel={label} accessibilityRole="button" accessibilityState={active ? { selected: true } : undefined}
          onPress={() => onPress(key)} style={local.action}>
          <View style={[local.icon, primary && local.iconPrimary, active && !primary && local.iconActive]}>
            <AppIcon icon={icon} size="md" color={primary ? colors.surface : colors.primary} />
          </View>
          <Text numberOfLines={2} style={[local.label, active && local.labelActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  action: { alignItems: "center", flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 72, paddingHorizontal: spacing.xs },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 24, height: 40, justifyContent: "center", width: 40 },
  iconPrimary: { backgroundColor: colors.primary, height: 48, width: 48 },
  iconActive: { borderColor: colors.primary, borderWidth: 2 },
  label: { ...textStyles.labelSmall, color: colors.text, fontSize: 12, lineHeight: 15, textAlign: "center" },
  labelActive: { color: colors.primary },
});
