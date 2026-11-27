import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

type Props = { html: string; style?: StyleProp<ViewStyle>; interactive?: boolean; accessibilityLabel?: string };

/**
 * A Leaflet / OpenStreetMap page. Phones: react-native-webview. Web: the same page in an iframe (react-native-webview
 * is native-only). `interactive` false lets taps fall through to a parent Pressable (the small map in an order).
 */
export default function MapFrame({ html, style, interactive = true, accessibilityLabel }: Props): React.JSX.Element {
  if (Platform.OS === "web") {
    return (
      <View style={[local.frame, style]} pointerEvents={interactive ? "auto" : "none"} accessibilityLabel={accessibilityLabel}>
        {React.createElement("iframe", {
          srcDoc: html,
          title: accessibilityLabel ?? "Bản đồ",
          style: { border: 0, height: "100%", width: "100%", pointerEvents: interactive ? "auto" : "none" },
          sandbox: "allow-scripts",
        })}
      </View>
    );
  }
  return (
    <View style={[local.frame, style]} pointerEvents={interactive ? "auto" : "none"} accessibilityLabel={accessibilityLabel}>
      <WebView originWhitelist={["*"]} source={{ html }} scrollEnabled={interactive} />
    </View>
  );
}

const local = StyleSheet.create({ frame: { overflow: "hidden" } });
