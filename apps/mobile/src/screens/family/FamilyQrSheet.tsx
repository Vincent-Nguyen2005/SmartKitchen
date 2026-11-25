import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { X } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles } from "../../theme";
import { useSession } from "../../services/session";
import type { FamilyQr } from "../../services/api";
import { encodeQr } from "./qrCode";
import { QR_HINT, QrSession } from "./familyQr";

type Props = { visible: boolean; onClose: () => void };

/** Dark modules as one SVG path (one 1x1 square per module, 4-module quiet zone). */
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
 * "QR gia đình" for the family owner: a fresh one-time join QR each time it opens. Closing (button, Android back,
 * tapping outside), leaving the screen or the app going to the background revokes it (QrSession); the server also
 * expires it after 10 minutes. No "new code" button and no long-lived code.
 */
export default function FamilyQrSheet({ visible, onClose }: Props): React.JSX.Element {
  const { createFamilyQr, revokeFamilyQr, family } = useSession();
  const [qr, setQr] = useState<FamilyQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<QrSession<FamilyQr> | null>(null);
  if (!session.current) session.current = new QrSession<FamilyQr>({ create: createFamilyQr, revoke: (token) => revokeFamilyQr(token) }, setQr);

  useEffect(() => {
    if (!visible) return undefined;
    const current = session.current as QrSession<FamilyQr>;
    setError(null);
    current.open().catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Chưa tạo được mã QR. Thử lại nhé."));
    // The app going to the background ends the QR (and the sheet).
    const subscription = AppState.addEventListener("change", (state) => { if (current.onAppState(state)) onClose(); });
    return () => {
      subscription.remove();
      current.close(); // sheet closed or unmounted: revoke now
    };
    // onClose is a fresh closure per render; the session only follows `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Đóng mã QR" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>{qr?.family.name ?? family?.name ?? "Gia đình"}</Text>
            <TouchableOpacity accessibilityLabel="Đóng" accessibilityRole="button" onPress={onClose} style={styles.close}>
              <AppIcon icon={X} size="md" />
            </TouchableOpacity>
          </View>
          <View style={styles.qrBox}>
            {qr ? <QrImage text={qr.payload} size={240} /> : error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : <ActivityIndicator size="large" color={colors.primary} />}
          </View>
          <Text style={styles.hint}>{QR_HINT}</Text>
          <Text style={styles.caption}>Người muốn tham gia bấm "QR gia đình" trên máy của họ và quét mã này.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md, maxWidth: 440, padding: spacing.lg, paddingBottom: spacing.xl, width: "100%" },
  header: { alignItems: "center", alignSelf: "stretch", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  title: { ...textStyles.heading, flex: 1 },
  close: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  qrBox: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 264, justifyContent: "center", width: 264 },
  hint: { ...textStyles.label, color: colors.primary, textAlign: "center" },
  caption: { ...textStyles.bodySmall, color: colors.muted, textAlign: "center" },
  error: { ...textStyles.bodySmall, color: colors.danger, padding: spacing.md, textAlign: "center" },
});
