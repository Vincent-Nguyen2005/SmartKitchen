import React from "react";
import { Text, type TextProps } from "react-native";
import { textStyles, type TypographyVariant } from "./typography";

type AppTextProps = TextProps & {
  /** Step of the type scale; defaults to `body`. */
  variant?: TypographyVariant;
  /** Text colour override (otherwise the variant's default colour). */
  color?: string;
};

/**
 * `Text` with the shared type scale: `<AppText variant="pageTitle" accessibilityRole="header">Thông báo</AppText>`.
 * Extra `style` is applied last, but must not set `fontSize` (use a variant instead).
 */
export function AppText({ variant = "body", color, style, ...props }: AppTextProps): React.JSX.Element {
  return <Text {...props} style={[textStyles[variant], color ? { color } : null, style]} />;
}
