import React from "react";
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Search, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, spacing, typography } from "../theme";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Outer spacing only (e.g. marginTop); the box itself is the same everywhere. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The one search box used by Kho and Đi chợ: same height, padding, icon, radius and colours, with a clear button.
 * Screens put SEARCH_CONTENT_GAP between it and the content below.
 */
export function SearchBar({ value, onChangeText, placeholder, accessibilityLabel, style }: Props): React.JSX.Element {
  return (
    <View style={[styles.box, style]}>
      <AppIcon icon={Search} size="md" color={colors.primary} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {value.length > 0 && <IconButton accessibilityLabel="Xóa nội dung tìm kiếm" icon={X} onPress={() => onChangeText("")} />}
    </View>
  );
}

/** Space between the search box and the content under it (Kho's list top padding). */
export const SEARCH_CONTENT_GAP = spacing.lg;
/** Space between the tab bar and the search box (Đi chợ's spacing, the standard for every tab). */
export const SEARCH_TOP_GAP = spacing.xl;
/** Content width cap on wide screens (tablets / web), shared with the list under the search box. */
export const SEARCH_MAX_WIDTH = 920;

type HeaderProps = Props & { horizontalPadding: number; wide?: boolean };

/**
 * The search box at the top of a tab (Kho, Đi chợ): same top gap under the tab bar, side padding and wide-screen
 * width everywhere, so the box does not move when switching tabs. The screen's SafeAreaView must use only the
 * left / right edges (the tab bar already sits below the status bar).
 */
export function SearchHeader({ horizontalPadding, wide = false, style, ...search }: HeaderProps): React.JSX.Element {
  return (
    <View style={[styles.header, { paddingHorizontal: horizontalPadding }, wide && styles.wide, style]}>
      <SearchBar {...search} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: SEARCH_TOP_GAP, width: "100%" },
  wide: { alignSelf: "center", maxWidth: SEARCH_MAX_WIDTH, width: "100%" },
  box: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: spacing.lg },
  input: { color: colors.text, flex: 1, fontFamily, fontSize: typography.body.fontSize, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
});
