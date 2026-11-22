import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, typography } from "../theme";

const SEPARATORS = /[,，\r\n]/;
const key = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").trim().toLocaleLowerCase();

/** Adds the comma/line separated parts of `value` to `current` (trimmed, no duplicates, case-insensitive). */
export const addTags = (current: string[], value: string): string[] => {
  const tags = [...current];
  const seen = new Set(current.map(key));
  for (const part of value.split(SEPARATORS)) {
    const tag = part.trim();
    if (tag && !seen.has(key(tag))) {
      tags.push(tag);
      seen.add(key(tag));
    }
  }
  return tags;
};

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  accessibilityLabel: string;
  placeholder: string;
  /**
   * Autocomplete list shown while typing (e.g. a catalog), filtered without accents. Typed text that matches a
   * suggestion takes the suggestion's spelling; any other text is added as the user's own tag.
   */
  suggestions?: string[];
};

/**
 * Tag input (Cài đặt gia đình "Lưu ý ăn uống", Thông tin sức khỏe "Dị ứng" / "Bệnh lý"): type, then Enter or a comma
 * adds a tag; each tag chip has "×" to remove it. Optional suggestions appear under the box while typing.
 */
export function TagInput({ tags, onChange, accessibilityLabel, placeholder, suggestions = [] }: Props): React.JSX.Element {
  const [text, setText] = useState("");
  /** Adds typed parts; a part equal to a suggestion (ignoring accents and case) uses the suggestion's spelling. */
  const add = (value: string) => {
    const parts = value.split(SEPARATORS).map((item) => item.trim()).filter(Boolean)
      .map((part) => suggestions.find((option) => key(option) === key(part)) ?? part);
    if (parts.length) onChange(addTags(tags, parts.join(",")));
  };

  const change = (value: string) => {
    const parts = value.split(SEPARATORS);
    if (parts.length > 1) {
      add(parts.slice(0, -1).join(","));
      setText(parts[parts.length - 1] ?? "");
    } else {
      setText(value);
    }
  };

  const commit = () => {
    add(text);
    setText("");
  };

  const taken = new Set(tags.map(key));
  const typed = key(text);
  const matches = typed
    ? suggestions.filter((option) => !taken.has(key(option)) && key(option).includes(typed)).slice(0, 6)
    : [];

  return (
    <View style={local.wrap}>
      <View style={local.box}>
        {tags.map((tag) => (
          <View key={tag} style={local.tag}>
            <Text style={local.tagText}>{tag}</Text>
            <Pressable accessibilityLabel={`Xoá tag ${tag}`} accessibilityRole="button" hitSlop={6}
              onPress={() => onChange(tags.filter((item) => item !== tag))} style={local.remove}>
              <AppIcon icon={X} size="sm" color={colors.primary} />
            </Pressable>
          </View>
        ))}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="sentences"
          onBlur={commit}
          onChangeText={change}
          onSubmitEditing={commit}
          placeholder={tags.length ? "Thêm tag..." : placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={local.input}
          value={text}
        />
      </View>
      {matches.length > 0 && (
        <View style={local.suggestions} accessibilityLabel="Gợi ý">
          {matches.map((option) => (
            <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Thêm ${option}`}
              onPress={() => { onChange(addTags(tags, option)); setText(""); }}
              style={({ pressed }) => [local.suggestion, pressed && local.pressed]}>
              <Text style={local.suggestionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, minHeight: 52, padding: spacing.sm },
  tag: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, flexDirection: "row", minHeight: 34, paddingLeft: 10, paddingRight: 2 },
  tagText: { ...textStyles.bodySmall, color: colors.primary, fontWeight: "600" },
  remove: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  input: { color: colors.text, flexGrow: 1, fontSize: typography.body.fontSize, minHeight: 40, minWidth: 130, paddingHorizontal: 4 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suggestion: { borderColor: colors.primary, borderRadius: radius.pill, borderWidth: 1, minHeight: 32, justifyContent: "center", paddingHorizontal: spacing.sm },
  suggestionText: { ...textStyles.labelSmall, color: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
});
