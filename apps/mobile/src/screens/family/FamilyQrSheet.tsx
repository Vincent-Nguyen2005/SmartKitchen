import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { X } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import type { FamilyQr } from "../../services/api";
import { encodeQr } from "./qrCode";
import { QR_CAPTION, QR_TITLE, QrSession, qrDisplaySize } from "./familyQr";

type Props = { visible: boolean; onClose: () => void };

/** Dark modules as one SVG path on white, with the standard 4-module quiet zone. */
function QrImage({ text, size }: { text: string; size: number }): React.JSX.Element {
  const qr = useMemo(() => encodeQr(text), [text]);
  const quiet = 4;
  const total = qr.size + quiet * 2;
  const path = qr.modules.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : []))).join("");
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} accessibilityLabel="Mã QR gia đình">
      <Rect x={0} y={0} width={total} height={total} fill={colors.surface} />
      <Path d={path} fill={colors.text} />
    </Svg>
  );
}

/**
 * "QR gia đình" for the family owner: a full-screen page with one large QR. A fresh one-time token each time it
 * opens; closing (X, Android back), leaving the screen, the app going to the background, or a token that arrives
 * after closing all revoke it (QrSession); the server also expires it after 10 minutes.
 */
export default function FamilyQrSheet({ visible, onClose }: Props): React.JSX.Element {
  const { createFamilyQr, revokeFamilyQr } = useSession();
  const { width } = useWindowDimensions();
  const [qr, setQr] = useState<FamilyQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<QrSession<FamilyQr> | null>(null);
  if (!session.current) session.current = new QrSession<FamilyQr>({ create: createFamilyQr, revoke: (token) => revokeFamilyQr(token) }, setQr);
  const qrSize = qrDisplaySize(width);

  const load = useCallback(() => {
    setError(null);
    (session.current as QrSession<FamilyQr>).open()
      .catch(() => setError("Chưa tạo được mã QR."));
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const current = session.current as QrSession<FamilyQr>;
    load();
    // The app going to the background ends the QR (and closes the page).
    const subscription = AppState.addEventListener("change", (state) => { if (current.onAppState(state)) onClose(); });
    return () => {
      subscription.remove();
      current.close(); // page closed or unmounted: revoke now
    };
    // onClose is a fresh closure per render; the session only follows `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} onPress={onClose} style={styles.close}>
            <AppIcon icon={X} size="md" color={colors.text} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{QR_TITLE}</Text>
          <View style={styles.close} />
        </View>
        <View style={styles.body}>
          <View style={[styles.card, { width: qrSize + spacing.lg * 2, height: qrSize + spacing.lg * 2 }]}>
            {qr ? (
              <QrImage text={qr.payload} size={qrSize} />
            ) : error ? (
              <View style={styles.errorBox}>
                <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={load} style={styles.retry}>
                  <Text style={styles.retryText}>Thử lại</Text>
                </Pressable>
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Đang tạo mã QR" />
            )}
          </View>
          <Text style={styles.caption}>{QR_CAPTION}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  close: { alignItems: "center", height: touchTarget, justifyContent: "center", width: touchTarget },
  title: { ...textStyles.heading, flex: 1, textAlign: "center" },
  body: { alignItems: "center", flex: 1, gap: spacing.lg, justifyContent: "center", padding: spacing.lg },
  card: {
    alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1,
    elevation: 2, justifyContent: "center", shadowColor: colors.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  caption: { ...textStyles.body, color: colors.text, textAlign: "center" },
  errorBox: { alignItems: "center", gap: spacing.md, padding: spacing.lg },
  error: { ...textStyles.body, color: colors.danger, textAlign: "center" },
  retry: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  retryText: { ...textStyles.label, color: colors.primaryText },
});
