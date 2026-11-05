import { Platform, StyleSheet, type TextStyle } from "react-native";
import { colors } from "./tokens";

/**
 * System font only (no font files). iOS "System" = San Francisco, Android "sans-serif" = Roboto.
 * On web a system-ui stack, so text (including SVG chart labels) never falls back to a serif font.
 */
export const fontFamily: string | undefined = Platform.select({
  ios: "System",
  android: "sans-serif",
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

/** Smallest allowed font size. Nothing in the app should be below this. */
export const minFontSize = 12;

/**
 * Agreed type scale (team decision, #71). Line heights are ~1.3x the size.
 * `label` / `labelSmall` are for button and label text (body / bodySmall at weight 600).
 */
export const typography = {
  pageTitle: { fontFamily, fontSize: 28, fontWeight: "700", lineHeight: 36 },
  heading: { fontFamily, fontSize: 22, fontWeight: "700", lineHeight: 28 },
  subheading: { fontFamily, fontSize: 18, fontWeight: "700", lineHeight: 24 },
  body: { fontFamily, fontSize: 16, fontWeight: "400", lineHeight: 21 },
  bodySmall: { fontFamily, fontSize: 14, fontWeight: "400", lineHeight: 18 },
  caption: { fontFamily, fontSize: minFontSize, fontWeight: "400", lineHeight: 16 },
  label: { fontFamily, fontSize: 16, fontWeight: "600", lineHeight: 21 },
  labelSmall: { fontFamily, fontSize: 14, fontWeight: "600", lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Ready-to-use text styles: the scale plus a default colour (`colors.text`; captions use `colors.muted`).
 * Combine with a colour override when needed: `style={[textStyles.body, { color: colors.danger }]}`.
 */
export const textStyles = StyleSheet.create({
  pageTitle: { ...typography.pageTitle, color: colors.text },
  heading: { ...typography.heading, color: colors.text },
  subheading: { ...typography.subheading, color: colors.text },
  body: { ...typography.body, color: colors.text },
  bodySmall: { ...typography.bodySmall, color: colors.text },
  caption: { ...typography.caption, color: colors.muted },
  label: { ...typography.label, color: colors.text },
  labelSmall: { ...typography.labelSmall, color: colors.text },
});
