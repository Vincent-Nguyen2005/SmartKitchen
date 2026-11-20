import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Mic, Square } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, touchTarget } from "../../theme";

export const MIC_PERMISSION_TEXT = "Cần quyền micro để nhận dạng giọng nói";

/** Permission or info message with "Mở cài đặt" (phones only) and "Đóng". A Modal, so it also shows on web. */
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

type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type VoiceHandlers = {
  /** Called with what was heard (non-empty); the caller opens the voice draft with it. */
  onTranscript: (text: string) => void;
  onPermissionDenied: () => void;
  onMessage: (text: string) => void;
};

/**
 * "Giọng nói" from the bottom bar: starts listening on the tap, with a small overlay (animated mic, "Đang nghe...",
 * stop). Phones: expo-speech-recognition, Vietnamese, on-device (as before; needs a development build).
 * Web: the browser speech API, created and started synchronously inside the tap.
 */
export function useInstantVoice(handlers: VoiceHandlers) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const transcript = useRef("");
  // false once a session ended (or was stopped while the native module was still loading).
  const active = useRef(false);
  const failure = useRef<"denied" | "message" | null>(null);
  const nativeModule = useRef<SpeechModule | null>(null);
  const webRecognition = useRef<WebRecognition | null>(null);
  const subscriptions = useRef<Array<{ remove: () => void }>>([]);
  const latest = useRef(handlers);
  latest.current = handlers;

  const cleanup = () => {
    subscriptions.current.forEach((subscription) => subscription.remove());
    subscriptions.current = [];
    webRecognition.current = null;
  };
  useEffect(() => () => {
    cleanup();
    try { nativeModule.current?.abort(); } catch { /* module may be missing in Expo Go */ }
  }, []);

  const finish = () => {
    if (!active.current) return;
    active.current = false;
    cleanup();
    setListening(false);
    const text = transcript.current.trim();
    if (failure.current === "denied") latest.current.onPermissionDenied();
    else if (text) latest.current.onTranscript(text);
    else if (failure.current !== "message") latest.current.onMessage("Chưa nghe rõ tên thực phẩm. Hãy thử lại, ví dụ: “2 kg gạo”.");
  };
  const fail = (kind: "denied" | "message", message?: string) => {
    failure.current = kind;
    if (kind === "message" && message) latest.current.onMessage(message);
  };

  const startWeb = () => {
    const scope = globalThis as unknown as { SpeechRecognition?: new () => WebRecognition; webkitSpeechRecognition?: new () => WebRecognition };
    const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Recognition) { active.current = false; latest.current.onMessage("Trình duyệt không hỗ trợ giọng nói"); return; }
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ");
      transcript.current = text;
      setHeard(text);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") fail("denied");
      else if (event.error !== "no-speech" && event.error !== "aborted") fail("message", "Không nhận dạng được giọng nói. Hãy thử lại.");
    };
    recognition.onend = finish;
    webRecognition.current = recognition;
    try {
      recognition.start(); // still inside the tap handler
      setListening(true);
    } catch {
      webRecognition.current = null;
      active.current = false;
      latest.current.onMessage("Trình duyệt không hỗ trợ giọng nói");
    }
  };

  const startNative = async () => {
    setListening(true);
    try {
      const { ExpoSpeechRecognitionModule } = await import("expo-speech-recognition");
      if (!active.current) return;
      nativeModule.current = ExpoSpeechRecognitionModule;
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable() || !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        fail("message", "Thiết bị chưa hỗ trợ nhận dạng tiếng Việt trên máy.");
        finish();
        return;
      }
      // Asked on the first tap, never at app start.
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!active.current) return;
      if (!permission.granted) { fail("denied"); finish(); return; }
      subscriptions.current = [
        ExpoSpeechRecognitionModule.addListener("result", (event) => {
          transcript.current = event.results[0]?.transcript ?? "";
          setHeard(transcript.current);
        }),
        ExpoSpeechRecognitionModule.addListener("error", (event) => {
          if (event.error === "not-allowed") fail("denied");
          else if (event.error !== "no-speech" && event.error !== "aborted") fail("message", `Không nhận dạng được giọng nói (${event.error}). Hãy thử lại.`);
        }),
        ExpoSpeechRecognitionModule.addListener("end", finish),
      ];
      ExpoSpeechRecognitionModule.start({ lang: "vi-VN", interimResults: true, continuous: false, requiresOnDeviceRecognition: true });
    } catch {
      fail("message", "Bản ứng dụng này chưa có module giọng nói (cần development build, không dùng Expo Go).");
      finish();
    }
  };

  const start = () => {
    if (listening) return;
    transcript.current = "";
    failure.current = null;
    active.current = true;
    setHeard("");
    if (Platform.OS === "web") startWeb();
    else void startNative();
  };

  const stop = () => {
    if (webRecognition.current) webRecognition.current.stop();
    else if (nativeModule.current && subscriptions.current.length) nativeModule.current.stop();
    else finish(); // still starting: end the session; startNative sees active=false and stops there
  };

  const overlay = <VoiceOverlay visible={listening} heard={heard} onStop={stop} />;
  return { start, stop, listening, overlay };
}

function VoiceOverlay({ visible, heard, onStop }: { visible: boolean; heard: string; onStop: () => void }): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onStop}>
      <View style={styles.overlayBackdrop}>
        <View accessibilityLiveRegion="polite" style={styles.overlayCard}>
          <Animated.View style={[styles.micHalo, { transform: [{ scale }] }]}>
            <AppIcon icon={Mic} size="xl" color={colors.primaryText} />
          </Animated.View>
          <Text style={styles.listeningText}>Đang nghe...</Text>
          <Text style={styles.heardText} numberOfLines={3}>{heard || "Nói tên thực phẩm, ví dụ: “2 kg gạo”"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dừng nghe" onPress={onStop} style={styles.stopButton}>
            <AppIcon icon={Square} size="sm" color={colors.primaryText} />
            <Text style={styles.primaryText}>Dừng</Text>
          </Pressable>
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
  overlayBackdrop: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg, paddingBottom: spacing.xl * 3 },
  overlayCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.md, maxWidth: 360, padding: spacing.xl, width: "100%" },
  micHalo: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  listeningText: { ...textStyles.subheading },
  heardText: { ...textStyles.bodySmall, color: colors.muted, textAlign: "center" },
  stopButton: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.sm, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.xl },
});
