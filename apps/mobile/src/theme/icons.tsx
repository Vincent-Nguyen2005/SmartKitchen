import React from "react";
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, iconSize, iconStrokeWidth, radius, touchTarget } from "./tokens";

export type { LucideIcon };
export type IconSize = keyof typeof iconSize;

type AppIconProps = {
  /** A Lucide component, imported by name: `import { Bell } from "lucide-react-native"`. */
  icon: LucideIcon;
  size?: IconSize;
  color?: string;
};

/**
 * Decorative icon with the shared size / stroke / colour. It is hidden from screen readers:
 * the text or accessibilityLabel next to it carries the meaning.
 */
export function AppIcon({ icon: Icon, size = "md", color = colors.text }: AppIconProps): React.JSX.Element {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Icon size={iconSize[size]} color={color} strokeWidth={iconStrokeWidth} />
    </View>
  );
}

type IconButtonProps = {
  icon: LucideIcon;
  /** Required: an icon-only control has no visible text, so this is what screen readers announce. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  size?: IconSize;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Icon-only button with a touch target of at least 44 x 44. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, size = "md", color = colors.text, disabled, style }: IconButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { alignItems: "center", borderRadius: radius.pill, justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
        pressed && { backgroundColor: colors.border },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <AppIcon icon={icon} size={size} color={color} />
    </Pressable>
  );
}
