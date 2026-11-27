import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react-native";
import { AppIcon, type LucideIcon } from "../../theme";
import { colors, styles } from "../notifications/ui";
import { pagerModel, type PagerStep } from "./pager";

const ICONS: Record<PagerStep["key"], LucideIcon> = { first: ChevronsLeft, prev: ChevronLeft, next: ChevronRight, last: ChevronsRight };

type Props = { page: number; totalPages: number; onChange: (page: number) => void; disabled?: boolean };

/** Compact icon pager shared by Nguyên liệu and Món ăn: « ‹ 4 [5] 6 › » (labels in pager.ts). Nothing for one page. */
export function AdminPager({ page, totalPages, onChange, disabled }: Props): React.JSX.Element | null {
  const model = pagerModel(page, totalPages, disabled);
  if (!model) return null;
  const step = (entry: PagerStep) => (
    <TouchableOpacity key={entry.key} accessibilityRole="button" accessibilityLabel={entry.label} accessibilityState={{ disabled: !entry.enabled }}
      disabled={!entry.enabled} onPress={() => onChange(entry.target)} style={[styles.pageButton, local.icon, !entry.enabled && local.dimmed]}>
      <AppIcon icon={ICONS[entry.key]} size="sm" color={entry.enabled ? colors.text : colors.muted} />
    </TouchableOpacity>
  );
  return (
    <View style={styles.pagination} accessibilityLabel={`Trang ${page} trên ${totalPages}`}>
      {model.before.map(step)}
      {model.pages.map(({ number, current }) => (
        <TouchableOpacity key={number} accessibilityRole="button" accessibilityLabel={`Trang ${number}`} accessibilityState={{ selected: current, disabled }}
          disabled={disabled || current} onPress={() => onChange(number)} style={[styles.pageButton, current && styles.segmentSelected]}>
          <Text style={[styles.segmentText, current && styles.segmentTextSelected]}>{number}</Text>
        </TouchableOpacity>
      ))}
      {model.after.map(step)}
    </View>
  );
}

const local = StyleSheet.create({
  icon: { paddingHorizontal: 0, width: 40 },
  dimmed: { opacity: 0.4 },
});
