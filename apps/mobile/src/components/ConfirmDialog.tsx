import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, textStyles, touchTarget } from "../theme";

/**
 * cancelLabel defaults to "Hủy"; null shows only the confirm button (a notice: "Đã hiểu"). destructive shows the
 * confirm button in the danger colour (permanent delete).
 */
/** message is optional: a title-only question ("Xác nhận đã giao và thu …?") shows no body line. */
type Request = { title: string; message?: string; confirmLabel: string; cancelLabel?: string | null; destructive?: boolean };

/**
 * In-app yes/no dialog (same look as the Giỏ hàng checkout confirmation). Not Alert.alert or window.confirm:
 * those do nothing or are suppressed on some web browsers. It is an overlay (not a Modal), so it also works inside
 * a screen that is itself a Modal (the dish detail): render `dialog` as the last child of that screen.
 */
/** choose(): which button was pressed, or "dismiss" when the dialog was closed by tapping outside it. */
export type ConfirmChoice = "confirm" | "cancel" | "dismiss";

export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((choice: ConfirmChoice) => void) | null>(null);

  /** Two real choices plus closing (e.g. "Cộng thêm" / "Thêm riêng" / do nothing). */
  const choose = useCallback((next: Request): Promise<ConfirmChoice> => {
    resolver.current?.("dismiss");
    setRequest(next);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  /** Yes / no: only the confirm button answers true. */
  const confirm = useCallback((next: Request): Promise<boolean> => choose(next).then((choice) => choice === "confirm"), [choose]);

  const answer = (choice: ConfirmChoice) => {
    resolver.current?.(choice);
    resolver.current = null;
    setRequest(null);
  };

  const dialog = request ? (
    <View style={local.backdrop} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => answer("dismiss")} style={StyleSheet.absoluteFill} />
      <View style={local.card}>
        <Text style={local.title} accessibilityRole="header">{request.title}</Text>
        {request.message ? <Text style={local.message}>{request.message}</Text> : null}
        <View style={local.actions}>
          {request.cancelLabel === null ? null : <Pressable accessibilityRole="button" onPress={() => answer("cancel")} style={local.cancel}><Text style={local.cancelText}>{request.cancelLabel ?? "Hủy"}</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={() => answer("confirm")} style={[local.primary, request.destructive && local.destructive]}><Text style={local.primaryText}>{request.confirmLabel}</Text></Pressable>
        </View>
      </View>
    </View>
  ) : null;

  return { confirm, choose, dialog };
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
  destructive: { backgroundColor: colors.danger },
  primaryText: { ...textStyles.label, color: colors.primaryText },
});
