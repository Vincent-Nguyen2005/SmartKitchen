import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { Check, ImageOff } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles, type LucideIcon } from "../theme";
import { styles as ui, useGridCell, useLayout } from "../screens/notifications/ui";

/** Card grid used by Đi chợ and Kho: 3 columns on phones, 4 on tablets and wide web. */
export function useCardGrid() {
  const layout = useLayout();
  const columns = layout.isWide ? 4 : 3;
  const grid = useGridCell(columns, spacing.sm);
  const cardWidth: DimensionValue = grid.cellWidth ?? `${Math.floor(100 / columns) - 2}%`;
  return {
    layout,
    columns,
    /** Six full rows per page (18 or 24), under the catalog API's limit of 50. */
    pageSize: columns * 6,
    onLayout: grid.onLayout,
    gap: grid.gap,
    cardWidth,
  };
}

/** Neutral placeholder for a missing or broken image (same icon in Đi chợ and Kho). */
export function ImagePlaceholder({ style }: { style?: object }): React.JSX.Element {
  return (
    <View style={[local.placeholder, style]}>
      <AppIcon icon={ImageOff} size="lg" color={colors.muted} />
    </View>
  );
}

export type CardPillTone = "discount" | "warning" | "danger" | "ai";
const pillColors: Record<CardPillTone, string> = { discount: colors.danger, warning: colors.warning, danger: colors.danger, ai: colors.primary };

type Props = {
  width: DimensionValue;
  /** Fills the square image area (pass a component sized with `cardImageStyle`). */
  image: React.ReactNode;
  /** Corner pill; `icon` (optional) is drawn before the label (e.g. the family health warning). */
  pill?: { label: string; tone: CardPillTone; icon?: LucideIcon } | null;
  name: string;
  /** Line under the name: unit (Đi chợ) or quantity + unit (Kho); omitted = image and name only. */
  subtitle?: string;
  /** Price row (Đi chợ) or expiry line (Kho). */
  footer?: React.ReactNode;
  /** Omitted = a display-only card (not a button), e.g. "Cần mua tuần này". */
  onPress?: () => void;
  accessibilityLabel: string;
  /** Small label in the image's bottom-left corner (Nấu ăn: "Đã ăn" with a check). */
  marker?: string;
  /** Small round button in the image's top-right corner (Nấu ăn: "Đổi món khác"); `busy` shows a spinner. */
  cornerAction?: { icon: LucideIcon; label: string; onPress: () => void; busy?: boolean };
  /** Long press (Đi chợ: starts selection mode). */
  onLongPress?: () => void;
  /** Selection mode: undefined = not selectable; true / false = selected or not (check overlay + highlighted border). */
  selected?: boolean;
};

/** Square image with an optional corner pill, the name (max 2 lines), a subtitle and a footer. */
export function ProductCard({ width, image, pill, name, subtitle, footer, onPress, onLongPress, selected, accessibilityLabel, cornerAction, marker }: Props): React.JSX.Element {
  const selectable = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={onPress ? (selectable ? "checkbox" : "button") : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selectable ? { checked: selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [local.card, { width }, selected && local.cardSelected, pressed && ui.pressed]}
    >
      <View style={local.imageArea}>
        {image}
        {selected && <View pointerEvents="none" style={local.selectedTint} />}
        {selectable && (
          <View pointerEvents="none" style={[local.check, selected && local.checkOn]}>
            {selected && <AppIcon icon={Check} size="sm" color={colors.primaryText} />}
          </View>
        )}
        {pill && (
          <View style={[local.pill, pill.icon && local.pillWithIcon, { backgroundColor: pillColors[pill.tone] }]}>
            {pill.icon && <AppIcon icon={pill.icon} size="sm" color={colors.surface} />}
            <Text style={local.pillText} numberOfLines={1}>{pill.label}</Text>
          </View>
        )}
        {!!marker && (
          <View style={local.marker}>
            <AppIcon icon={Check} size="sm" color={colors.primaryText} />
            <Text style={local.markerText} numberOfLines={1}>{marker}</Text>
          </View>
        )}
        {cornerAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cornerAction.label}
            accessibilityState={{ busy: !!cornerAction.busy, disabled: !!cornerAction.busy }}
            disabled={cornerAction.busy}
            hitSlop={8}
            // Its own press: never also opens the card's detail (web click bubbling included).
            onPress={(event) => { event?.stopPropagation?.(); cornerAction.onPress(); }}
            style={({ pressed }) => [local.corner, pressed && ui.pressed]}
          >
            {cornerAction.busy ? <ActivityIndicator color={colors.primary} /> : <AppIcon icon={cornerAction.icon} size="sm" color={colors.primary} />}
          </Pressable>
        )}

      </View>
      <View style={local.body}>
        <Text style={local.name} numberOfLines={2}>{name}</Text>
        {!!subtitle && <Text style={local.subtitle} numberOfLines={1}>{subtitle}</Text>}
        {footer}
      </View>
    </Pressable>
  );
}

/** Style for the image inside the card's square area. */
export const cardImageStyle = { height: "100%", width: "100%", borderRadius: 0 } as const;

/** Price row: discounted price in the primary color with the original struck through, plain price, or "Chưa có giá". */
export function CardPrice({ price, discountedPrice }: { price: string | null; discountedPrice?: string | null }): React.JSX.Element {
  if (price === null) return <Text style={local.caption} numberOfLines={1}>Chưa có giá</Text>;
  if (discountedPrice) {
    return (
      <View>
        <Text style={local.price} numberOfLines={1}>{discountedPrice}</Text>
        <Text style={local.oldPrice} numberOfLines={1}>{price}</Text>
      </View>
    );
  }
  return <Text style={local.plainPrice} numberOfLines={1}>{price}</Text>;
}

/** Muted caption line (e.g. "HSD 25/11"); `warning` colors it for expired / expiring items. */
/** Caption under the card (Kho expiry): `tone` "danger" = red (expired), "warning" = amber (expiring soon). */
export function CardCaption({ text, warning = false, tone }: { text: string; warning?: boolean; tone?: "danger" | "warning" | null }): React.JSX.Element {
  const shown = tone ?? (warning ? "warning" : null);
  return <Text style={[local.caption, shown === "warning" && local.captionWarning, shown === "danger" && local.captionDanger]} numberOfLines={1}>{text}</Text>;
}

const local = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  // Selected: the theme's primary colour as a thicker border (the card keeps its size: 1 px border + 1 px outline).
  cardSelected: { borderColor: colors.primary, borderWidth: 2, margin: -1 },
  selectedTint: { backgroundColor: colors.primarySoft, bottom: 0, left: 0, opacity: 0.45, position: "absolute", right: 0, top: 0 },
  check: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 2, height: 24, justifyContent: "center", position: "absolute", right: 8, top: 8, width: 24 },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  imageArea: { aspectRatio: 1, backgroundColor: colors.background, width: "100%" },
  placeholder: { alignItems: "center", backgroundColor: colors.background, height: "100%", justifyContent: "center", width: "100%" },
  pill: { borderRadius: radius.pill, left: spacing.xs, maxWidth: "90%", paddingHorizontal: spacing.xs + 2, paddingVertical: 1, position: "absolute", top: spacing.xs },
  marker: { alignItems: "center", backgroundColor: colors.success, borderRadius: radius.pill, bottom: spacing.xs, flexDirection: "row", gap: 2, left: spacing.xs, maxWidth: "90%", paddingHorizontal: spacing.xs + 2, paddingVertical: 1, position: "absolute" },
  markerText: { ...textStyles.caption, color: colors.primaryText, fontWeight: "700" },
  corner: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: radius.pill, borderWidth: 1, height: 32, justifyContent: "center", position: "absolute", right: spacing.xs, top: spacing.xs, width: 32 },
  pillText: { ...textStyles.caption, color: colors.surface, fontWeight: "700" },
  pillWithIcon: { alignItems: "center", flexDirection: "row", gap: 2 },
  body: { gap: 2, padding: spacing.xs + 2 },
  name: { ...textStyles.caption, color: colors.text, fontWeight: "600" },
  subtitle: { ...textStyles.caption },
  price: { ...textStyles.caption, color: colors.primary, fontWeight: "700" },
  plainPrice: { ...textStyles.caption, color: colors.text, fontWeight: "700" },
  oldPrice: { ...textStyles.caption, textDecorationLine: "line-through" },
  caption: { ...textStyles.caption },
  captionWarning: { color: colors.warning, fontWeight: "600" },
  captionDanger: { color: colors.danger, fontWeight: "600" },
});
