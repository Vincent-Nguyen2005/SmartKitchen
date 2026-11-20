import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UserRoundPen } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";

export const PROFILE_MISSING_TEXT = "Tạo hồ sơ dinh dưỡng để có mục tiêu calo";

/** Shown when GET /api/nutrition answers 404; the button opens the "Hồ sơ" segment of Dinh dưỡng. */
export function ProfileMissingCard({ onOpenProfile }: { onOpenProfile?: () => void }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{PROFILE_MISSING_TEXT}</Text>
      {onOpenProfile && (
        <Pressable accessibilityRole="button" accessibilityLabel="Mở hồ sơ dinh dưỡng" onPress={onOpenProfile} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <AppIcon icon={UserRoundPen} size="sm" color={colors.primaryText} />
          <Text style={styles.buttonText}>Tạo hồ sơ</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderRadius: radius.sm, gap: spacing.sm, padding: spacing.md },
  text: { ...textStyles.bodySmall },
  button: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, flexDirection: "row", gap: spacing.xs, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  buttonText: { ...textStyles.labelSmall, color: colors.primaryText },
  pressed: { opacity: 0.85 },
});
