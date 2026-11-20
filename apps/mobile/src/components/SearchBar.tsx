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

const styles = StyleSheet.create({
  box: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: spacing.lg },
  input: { color: colors.text, flex: 1, fontFamily, fontSize: typography.body.fontSize, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
});
