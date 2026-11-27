import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import { pinFromFrameEvent } from "../screens/shopping-cart/orders";

type Props = {
  html: string;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  accessibilityLabel?: string;
  /** Text the page posts (the map picker's pin moves). Web: only messages from this iframe that are coordinates. */
  onMessage?: (data: string) => void;
};
/** postMessage: send text to the page (the map picker moves its pin). */
export type MapFrameHandle = { postMessage: (data: string) => void };

/**
 * A Leaflet / OpenStreetMap page. Phones: react-native-webview. Web: the same page in an iframe (react-native-webview
 * is native-only); messages go both ways with window.postMessage. `interactive` false lets taps fall through to a
 * parent Pressable (the small map in an order).
 */
const MapFrame = forwardRef<MapFrameHandle, Props>(function MapFrame({ html, style, interactive = true, accessibilityLabel, onMessage }, ref) {
  const webView = useRef<WebView<{}>>(null);
  const iframe = useRef<{ contentWindow: { postMessage: (data: string, origin: string) => void } | null } | null>(null);
  useImperativeHandle(ref, () => ({
    postMessage: (data: string) => {
      if (Platform.OS === "web") iframe.current?.contentWindow?.postMessage(data, "*");
      else webView.current?.postMessage(data);
    },
  }), []);

  // Web: listen to the iframe's messages (sandboxed page: origin "null", so the source window is what is checked).
  useEffect(() => {
    if (Platform.OS !== "web" || !onMessage) return undefined;
    const target = globalThis as unknown as { addEventListener: (type: string, listener: (event: { source: unknown; data: unknown }) => void) => void; removeEventListener: (type: string, listener: (event: { source: unknown; data: unknown }) => void) => void };
    const listener = (event: { source: unknown; data: unknown }) => {
      if (pinFromFrameEvent(event, iframe.current?.contentWindow ?? null)) onMessage(event.data as string);
    };
    target.addEventListener("message", listener);
    return () => target.removeEventListener("message", listener);
  }, [onMessage]);

  if (Platform.OS === "web") {
    return (
      <View style={[local.frame, style]} pointerEvents={interactive ? "auto" : "none"} accessibilityLabel={accessibilityLabel}>
        {React.createElement("iframe", {
          ref: iframe,
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
      <WebView
        ref={webView}
        originWhitelist={["*"]}
        source={{ html }}
        scrollEnabled={interactive}
        onMessage={onMessage ? (event) => onMessage(event.nativeEvent.data) : undefined}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
});

export default MapFrame;

const local = StyleSheet.create({ frame: { overflow: "hidden" } });
