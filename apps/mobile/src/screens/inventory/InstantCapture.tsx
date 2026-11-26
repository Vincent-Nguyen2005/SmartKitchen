import React from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, textStyles, touchTarget } from "../../theme";

/**
 * Bottom-bar capture helpers. "Chụp ảnh" opens the phone camera in the tap itself (see App.tsx); this dialog shows a
 * permission or info message with "Mở cài đặt" (phones only) and "Đóng". A Modal, so it also shows on web.
 */
export function CaptureDialog({ text, settings, onClose }: { text: string | null; settings?: boolean; onClose: () => void }): React.JSX.Element {
  return (
    <Modal animationType="fade" transparent visible={text !== null} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityRole="alert" style={styles.dialog}>
          <Text style={styles.dialogText}>{text}</Text>
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Đóng</Text></Pressable>
            {settings && Platform.OS !== "web" && (
              <Pressable accessibilityRole="button" onPress={() => { onClose(); void Linking.openSettings(); }} style={styles.primaryButton}>
                <Text style={styles.primaryText}>Mở cài đặt</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.md, maxWidth: 420, padding: spacing.lg, width: "100%" },
  dialogText: { ...textStyles.body },
  dialogActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  primaryText: { ...textStyles.label, color: colors.primaryText },
  secondaryButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  secondaryText: { ...textStyles.labelSmall },
});
