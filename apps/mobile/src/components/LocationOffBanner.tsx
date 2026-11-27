import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MapPinOff } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../theme";
import { LOCATION_OFF_TEXT } from "../services/locationState";

/** Shown when device location is off; "Bật định vị" asks the system once (only when tapped). */
export default function LocationOffBanner({ onEnable, busy = false }: { onEnable: () => void; busy?: boolean }): React.JSX.Element {
  return (
    <View style={local.banner} accessibilityRole="alert">
      <AppIcon icon={MapPinOff} size="sm" color={colors.warning} />
      <Text style={local.text}>{LOCATION_OFF_TEXT}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onEnable} style={[local.button, busy && local.disabled]}>
        <Text style={local.buttonText}>Bật định vị</Text>
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  banner: { alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.md, paddingVertical: spacing.xs },
  text: { ...textStyles.bodySmall, color: colors.text, flex: 1 },
  button: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  buttonText: { ...textStyles.labelSmall, color: colors.warning },
  disabled: { opacity: 0.5 },
});
