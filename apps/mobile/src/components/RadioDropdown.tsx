import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronDown, Search, X } from "lucide-react-native";
import { AppIcon, colors, spacing, touchTarget, typography } from "../theme";

export type RadioDropdownOption<Value extends string> = {
  value: Value;
  label: string;
};

type Props<Value extends string> = {
  label: string;
  value: Value;
  options: RadioDropdownOption<Value>[];
  onChange: (value: Value) => void;
  accessibilityLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function RadioDropdown<Value extends string>({
  label,
  value,
  options,
  onChange,
  accessibilityLabel,
  searchable = false,
  searchPlaceholder,
}: Props<Value>): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = search.trim().toLocaleLowerCase("vi");
  const filteredOptions = normalizedSearch
    ? options.filter((option) => option.label.toLocaleLowerCase("vi").includes(normalizedSearch))
    : options;
  const close = () => {
    setVisible(false);
    setSearch("");
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${selected?.label ?? value}`}
        accessibilityState={{ expanded: visible }}
        onPress={() => { setSearch(""); setVisible(true); }}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>{label}</Text>
          <Text numberOfLines={1} style={styles.triggerValue}>{selected?.label ?? value}</Text>
        </View>
        <AppIcon icon={ChevronDown} size="sm" color={colors.primary} />
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={close}
        transparent
        visible={visible}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Đóng danh sách lựa chọn"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <Text style={styles.sheetTitle}>Chọn {label.toLowerCase()}</Text>
                <Text style={styles.sheetSubtitle}>Chọn một giá trị</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={close}
                style={styles.closeButton}
              >
                <AppIcon icon={X} size="sm" color={colors.muted} />
              </Pressable>
            </View>
            {searchable && (
              <View style={styles.searchBox}>
                <AppIcon icon={Search} size="sm" color={colors.muted} />
                <TextInput
                  accessibilityLabel={searchPlaceholder ?? `Tìm ${label.toLowerCase()}`}
                  autoCapitalize="none"
                  onChangeText={setSearch}
                  placeholder={searchPlaceholder ?? `Tìm ${label.toLowerCase()}...`}
                  placeholderTextColor={colors.muted}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={search}
                />
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View accessibilityRole="radiogroup">
                {filteredOptions.map((option) => {
                  const checked = option.value === value;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked }}
                      key={option.value}
                      onPress={() => {
                        onChange(option.value);
                        close();
                      }}
                      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    >
                      <View style={[styles.radio, checked && styles.radioChecked]}>
                        {checked && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.optionLabel, checked && styles.optionLabelChecked]}>
                        {option.label}
                      </Text>
                      {checked && <AppIcon icon={Check} size="sm" color={colors.primary} />}
                    </Pressable>
                  );
                })}
                {filteredOptions.length === 0 && <Text style={styles.emptyText}>Không tìm thấy lựa chọn.</Text>}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: touchTarget,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pressed: { opacity: 0.82 },
  triggerText: { flex: 1, minWidth: 0 },
  triggerLabel: { color: colors.muted, ...typography.caption },
  triggerValue: { color: colors.text, ...typography.labelSmall, marginTop: 2 },
  overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "72%",
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.md },
  sheetHeading: { flex: 1, gap: spacing.xs },
  sheetTitle: { color: colors.text, ...typography.subheading },
  sheetSubtitle: { color: colors.muted, ...typography.bodySmall },
  closeButton: { alignItems: "center", borderRadius: 22, justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
  searchBox: { alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  searchInput: { color: colors.text, ...typography.body, flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  option: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingHorizontal: spacing.xs },
  optionPressed: { backgroundColor: colors.primarySoft },
  radio: { alignItems: "center", borderColor: colors.border, borderRadius: 10, borderWidth: 2, height: 20, justifyContent: "center", width: 20 },
  radioChecked: { borderColor: colors.primary },
  radioDot: { backgroundColor: colors.primary, borderRadius: 5, height: 10, width: 10 },
  optionLabel: { color: colors.text, ...typography.body, flex: 1 },
  optionLabelChecked: { color: colors.primary, fontWeight: "700" },
  emptyText: { color: colors.muted, ...typography.bodySmall, paddingVertical: spacing.lg, textAlign: "center" },
});
