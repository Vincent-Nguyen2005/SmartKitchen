import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ScanLine, X } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles } from "../../theme";
import { useSession } from "../../services/session";
import { useConfirm } from "../../components/ConfirmDialog";
import { afterVerify, qrErrorText } from "./familyQr";

type Props = { visible: boolean; onClose: () => void; onJoined: (familyName: string) => void };

/**
 * "QR gia đình" for everyone but the owner: scan the owner's QR → check it with family-service → "Tham gia gia đình
 * …?" → join. Expired / revoked codes, already-member and other-family cases get a message and change nothing.
 */
export default function FamilyQrScanner({ visible, onClose, onJoined }: Props): React.JSX.Element {
  const { verifyFamilyQr, joinFamilyByQr } = useSession();
  const { confirm, dialog } = useConfirm();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);

  const startScanning = async () => {
    setMessage(null);
    const granted = permission?.granted ? permission : await requestPermission().catch(() => null);
    if (!granted?.granted) { setMessage("Cần quyền camera để quét mã QR gia đình. Bật quyền camera trong Cài đặt của máy."); return; }
    locked.current = false;
    setScanning(true);
  };

  useEffect(() => {
    if (visible) void startScanning();
    else { setScanning(false); setMessage(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onScanned = async (value: string) => {
    if (locked.current) return;
    locked.current = true;
    setScanning(false);
    setBusy(true);
    try {
      const result = await verifyFamilyQr(value);
      const next = afterVerify(result.membership);
      if (next.kind === "message") { setMessage(next.text); return; }
      setBusy(false);
      if (!(await confirm({ title: `Tham gia gia đình ${result.family.name}?`, message: "Bạn sẽ dùng chung Kho, thực đơn và giỏ hàng với gia đình này.", confirmLabel: "Tham gia" }))) {
        setMessage(null);
        onClose();
        return;
      }
      setBusy(true);
      // The code must still be open on the owner's screen now.
      await joinFamilyByQr(value);
      onJoined(result.family.name);
      onClose();
    } catch (error) {
      setMessage(qrErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="fade" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Quét QR gia đình</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.close}>
            <AppIcon icon={X} size="md" />
          </Pressable>
        </View>
        <View style={styles.cameraBox}>
          {scanning ? (
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => void onScanned(data)}
              onMountError={() => { setScanning(false); setMessage("Không mở được camera. Hãy thử lại."); }} />
          ) : busy ? <ActivityIndicator size="large" color={colors.primary} /> : <AppIcon icon={ScanLine} size="xl" color={colors.muted} />}
        </View>
        <Text style={styles.hint}>Nhờ chủ nhà bấm "QR gia đình" và đưa mã cho bạn quét.</Text>
        {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
        {!scanning && !busy && (
          <Pressable accessibilityRole="button" onPress={() => void startScanning()} style={styles.primary}>
            <Text style={styles.primaryText}>Quét lại</Text>
          </Pressable>
        )}
      </SafeAreaView>
      {dialog}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  title: { ...textStyles.heading },
  close: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  cameraBox: { alignItems: "center", alignSelf: "center", aspectRatio: 1, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, justifyContent: "center", maxWidth: 420, overflow: "hidden", width: "100%" },
  hint: { ...textStyles.bodySmall, color: colors.muted, textAlign: "center" },
  message: { ...textStyles.body, color: colors.danger, textAlign: "center" },
  primary: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: 44, minWidth: 160, paddingHorizontal: spacing.lg },
  primaryText: { ...textStyles.label, color: colors.primaryText },
});
