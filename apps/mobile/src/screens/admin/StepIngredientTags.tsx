import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Plus, Search, X } from "lucide-react-native";
import { AppIcon, AppText, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { addStepIngredient, pickerOptions, removeStepIngredient, stepTags } from "./stepIngredients";

type Props = {
  /** Step number, for labels ("Bước 2"). */
  stepNumber: number;
  /** The recipe's ingredient names (recipeIngredientNames). */
  recipeNames: string[];
  /** Names attached to this step (what is saved). */
  value: string[];
  onChange: (value: string[]) => void;
};

/**
 * Ingredients used in one recipe step, as tags with "✕" (the TagInput look). "+ Thêm nguyên liệu" opens a small
 * searchable picker of the recipe's ingredients not attached to this step yet; picking one adds its tag.
 */
export function StepIngredientTags({ stepNumber, recipeNames, value, onChange }: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  if (recipeNames.length === 0) return null;
  const tags = stepTags(value, recipeNames);
  const options = pickerOptions(recipeNames, value, search);
  const remaining = pickerOptions(recipeNames, value).length;
  const close = () => { setOpen(false); setSearch(""); };

  return (
    <View style={local.wrap} accessibilityLabel={`Nguyên liệu dùng ở bước ${stepNumber}`}>
      <AppText variant="bodySmall" color={colors.muted}>Nguyên liệu dùng ở bước này</AppText>
      <View style={local.tags}>
        {tags.map((name) => (
          <View key={name} style={local.tag}>
            <Text style={local.tagText}>{name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Bỏ ${name} khỏi bước ${stepNumber}`} hitSlop={6} onPress={() => onChange(removeStepIngredient(value, name))} style={local.remove}>
              <AppIcon icon={X} size="sm" color={colors.primary} />
            </Pressable>
          </View>
        ))}
        {remaining > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Thêm nguyên liệu cho bước ${stepNumber}`} onPress={() => setOpen(true)} style={({ pressed }) => [local.add, pressed && local.pressed]}>
            <AppIcon icon={Plus} size="sm" color={colors.primary} />
            <Text style={local.addText}>Thêm nguyên liệu</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={local.backdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={close} style={StyleSheet.absoluteFill} />
          <View style={local.sheet}>
            <View style={local.sheetHeader}>
              <AppText variant="subheading" accessibilityRole="header" style={local.flex}>Thêm nguyên liệu · Bước {stepNumber}</AppText>
              <IconButton icon={X} accessibilityLabel="Đóng" onPress={close} />
            </View>
            <View style={local.search}>
              <AppIcon icon={Search} size="sm" color={colors.muted} />
              <TextInput accessibilityLabel="Tìm nguyên liệu" value={search} onChangeText={setSearch} placeholder="Tìm nguyên liệu" placeholderTextColor={colors.muted} style={local.searchInput} autoFocus />
            </View>
            <ScrollView style={local.list} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? <AppText variant="caption" style={local.empty}>Không có nguyên liệu phù hợp.</AppText> : options.map((name) => (
                <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Thêm ${name}`} onPress={() => { onChange(addStepIngredient(value, name)); close(); }} style={({ pressed }) => [local.option, pressed && local.pressed]}>
                  <AppIcon icon={Plus} size="sm" color={colors.primary} />
                  <Text style={local.optionText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  wrap: { gap: spacing.xs },
  tags: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Same tag as components/TagInput.tsx.
  tag: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, flexDirection: "row", minHeight: 34, paddingLeft: 10, paddingRight: 2 },
  tagText: { ...textStyles.bodySmall, color: colors.primary, fontWeight: "600" },
  remove: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  add: { alignItems: "center", borderColor: colors.primary, borderRadius: radius.pill, borderStyle: "dashed", borderWidth: 1, flexDirection: "row", gap: 4, minHeight: 34, paddingHorizontal: spacing.sm },
  addText: { ...textStyles.labelSmall, color: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
  backdrop: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, maxHeight: "70%", maxWidth: 420, padding: spacing.lg, width: "100%" },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  search: { alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  searchInput: { ...textStyles.body, flex: 1, minHeight: touchTarget - 2, padding: 0 },
  list: { flexGrow: 0 },
  empty: { paddingVertical: spacing.md, textAlign: "center" },
  option: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  optionText: { ...textStyles.body },
});
