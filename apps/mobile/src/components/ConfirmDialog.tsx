import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, textStyles, touchTarget } from "../theme";

/** cancelLabel defaults to "Hủy". */
type Request = { title: string; message: string; confirmLabel: string; cancelLabel?: string };

/**
 * In-app yes/no dialog (same look as the Giỏ hàng checkout confirmation). Not Alert.alert or window.confirm:
 * those do nothing or are suppressed on some web browsers. It is an overlay (not a Modal), so it also works inside
 * a screen that is itself a Modal (the dish detail): render `dialog` as the last child of that screen.
 */
export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: Request): Promise<boolean> => {
    resolver.current?.(false);
    setRequest(next);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const answer = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  };

  const dialog = request ? (
    <View style={local.backdrop} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Hủy" onPress={() => answer(false)} style={StyleSheet.absoluteFill} />
      <View style={local.card}>
        <Text style={local.title} accessibilityRole="header">{request.title}</Text>
        <Text style={local.message}>{request.message}</Text>
        <View style={local.actions}>
          <Pressable accessibilityRole="button" onPress={() => answer(false)} style={local.cancel}><Text style={local.cancelText}>{request.cancelLabel ?? "Hủy"}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => answer(true)} style={local.primary}><Text style={local.primaryText}>{request.confirmLabel}</Text></Pressable>
        </View>
      </View>
    </View>
  ) : null;

  return { confirm, dialog };
}

const local = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.lg, zIndex: 10, elevation: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.md, maxWidth: 420, padding: spacing.lg, width: "100%" },
  title: { ...textStyles.heading },
  message: { ...textStyles.bodySmall, color: colors.muted },
  actions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  cancel: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  cancelText: { ...textStyles.labelSmall, color: colors.text },
  primary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  primaryText: { ...textStyles.label, color: colors.primaryText },
});
