import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { AppText, breakpoints, colors, spacing } from "../../theme";

export type PaymentResult = "success" | "failed";

type Props = Readonly<{
  url: string;
  onComplete: (result: PaymentResult) => void;
  onClose: () => void;
}>;

function paymentResultFromUrl(value: string): PaymentResult | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "smartkitchen:" || url.hostname !== "payment-result") return null;
    const status = url.searchParams.get("status");
    return status === "success" || status === "failed" ? status : null;
  } catch {
    return null;
  }
}

export default function PaymentScreen({ url, onComplete, onClose }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const isWide = width >= breakpoints.wide;
  const completed = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const finishPayment = (result: PaymentResult): void => {
    if (completed.current) return;
    completed.current = true;
    Alert.alert(
      result === "success" ? "Thanh toán thành công" : "Thanh toán thất bại",
      result === "success" ? "Giao dịch đã được xác nhận." : "Giao dịch chưa hoàn tất. Bạn có thể kiểm tra trạng thái đơn hàng.",
      [{ text: "Đóng", onPress: () => onComplete(result) }],
      { cancelable: false },
    );
  };

  const inspectNavigation = (navigation: WebViewNavigation): void => {
    const result = paymentResultFromUrl(navigation.url);
    if (result) finishPayment(result);
  };

  const shouldStartNavigation = (request: { url: string }): boolean => {
    const result = paymentResultFromUrl(request.url);
    if (result) {
      finishPayment(result);
      return false;
    }
    return true;
  };

  return (
    <View style={[styles.container, isWide && styles.containerWide]}>
      <View style={styles.header}>
        <AppText variant="heading">Thanh toán</AppText>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <AppText variant="labelSmall" color={colors.primary}>Đóng</AppText>
        </Pressable>
      </View>
      {!!loadError ? (
        <View style={styles.message}>
          <AppText accessibilityRole="alert" variant="body" color={colors.danger}>{loadError}</AppText>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <AppText variant="labelSmall" color={colors.primary}>Quay lại</AppText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webViewContainer}>
          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <AppText variant="bodySmall" color={colors.muted}>Đang mở cổng thanh toán...</AppText>
            </View>
          )}
          <WebView
            source={{ uri: url }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={(event) => {
              console.error("[mobile] payment WebView failed to load:", event.nativeEvent.description);
              setLoadError("Không thể mở trang thanh toán. Vui lòng kiểm tra kết nối và thử lại.");
              setLoading(false);
            }}
            onNavigationStateChange={inspectNavigation}
            onShouldStartLoadWithRequest={shouldStartNavigation}
            startInLoadingState
            style={styles.webView}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  containerWide: { alignSelf: "center", maxWidth: breakpoints.extraWide, width: "100%" },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  closeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  webViewContainer: { flex: 1 },
  webView: { backgroundColor: colors.background, flex: 1 },
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.md,
  },
  message: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.lg },
});
