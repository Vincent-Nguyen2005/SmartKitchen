import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Plus, Search } from "lucide-react-native";
import { AppIcon, spacing } from "../../theme";
import { Button, colors, styles } from "../notifications/ui";

type Props = {
  /** Search box: placeholder and screen-reader name (no visible label). */
  placeholder: string;
  searchLabel: string;
  search: string;
  onSearch: (text: string) => void;
  /** The "+ Thêm" button; `addLabel` names it for screen readers ("Thêm nguyên liệu" / "Thêm món"). */
  addLabel: string;
  onAdd: () => void;
};

/** Visible text of the add button: short, so both screens' headers are identical on every width. */
export const ADD_BUTTON_TEXT = "Thêm";

/**
 * Quản trị › Nguyên liệu and Món ăn list header: the search input (flex) and a "+ Thêm" primary button on one row,
 * identical on both screens (same height, button width and spacing).
 */
export function AdminListHeader({ placeholder, searchLabel, search, onSearch, addLabel, onAdd }: Props): React.JSX.Element {
  return (
    <View style={local.row}>
      <View style={[styles.input, styles.inputWithIcon, local.search]}>
        <AppIcon icon={Search} size="sm" color={colors.muted} />
        <TextInput accessibilityLabel={searchLabel} placeholder={placeholder} placeholderTextColor={colors.muted} value={search} onChangeText={onSearch} autoCorrect={false} style={styles.inputBare} />
      </View>
      <Button label={ADD_BUTTON_TEXT} icon={Plus} accessibilityLabel={addLabel} onPress={onAdd} style={local.add} />
    </View>
  );
}

const local = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm, paddingTop: spacing.sm },
  search: { flex: 1, minWidth: 0 },
  add: { minWidth: 104 },
});
