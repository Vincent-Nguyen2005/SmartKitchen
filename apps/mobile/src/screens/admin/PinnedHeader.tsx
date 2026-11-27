import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../notifications/ui";

/**
 * Admin search header pinned under the tab bar while the list scrolls, the same way as the user app's Kho / Đi chợ
 * (components/SearchBar.tsx SearchHeader): the header sits OUTSIDE the FlatList on the screen background (no shadow)
 * and the list takes the space below it, so pull-to-refresh and the results stay right under the search box.
 */
export function PinnedHeader({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return <View style={[local.header, style]}>{children}</View>;
}

const local = StyleSheet.create({
  header: { backgroundColor: colors.background, zIndex: 1 },
});
