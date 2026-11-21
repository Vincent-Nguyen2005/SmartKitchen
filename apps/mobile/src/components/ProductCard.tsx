import React from "react";
import { Pressable, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { ImageOff } from "lucide-react-native";
import { AppIcon, colors, radius, spacing, textStyles } from "../theme";
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
  pill?: { label: string; tone: CardPillTone } | null;
  name: string;
  /** Line under the name: unit (Đi chợ) or quantity + unit (Kho). */
  subtitle: string;
  /** Price row (Đi chợ) or expiry line (Kho). */
  footer?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
};

/** Square image with an optional corner pill, the name (max 2 lines), a subtitle and a footer. */
export function ProductCard({ width, image, pill, name, subtitle, footer, onPress, accessibilityLabel }: Props): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [local.card, { width }, pressed && ui.pressed]}
    >
      <View style={local.imageArea}>
        {image}
        {pill && (
          <View style={[local.pill, { backgroundColor: pillColors[pill.tone] }]}>
            <Text style={local.pillText} numberOfLines={1}>{pill.label}</Text>
          </View>
        )}
      </View>
      <View style={local.body}>
        <Text style={local.name} numberOfLines={2}>{name}</Text>
        <Text style={local.subtitle} numberOfLines={1}>{subtitle}</Text>
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
export function CardCaption({ text, warning = false }: { text: string; warning?: boolean }): React.JSX.Element {
  return <Text style={[local.caption, warning && local.captionWarning]} numberOfLines={1}>{text}</Text>;
}

const local = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  imageArea: { aspectRatio: 1, backgroundColor: colors.background, width: "100%" },
  placeholder: { alignItems: "center", backgroundColor: colors.background, height: "100%", justifyContent: "center", width: "100%" },
  pill: { borderRadius: radius.pill, left: spacing.xs, maxWidth: "90%", paddingHorizontal: spacing.xs + 2, paddingVertical: 1, position: "absolute", top: spacing.xs },
  pillText: { ...textStyles.caption, color: colors.surface, fontWeight: "700" },
  body: { gap: 2, padding: spacing.xs + 2 },
  name: { ...textStyles.caption, color: colors.text, fontWeight: "600" },
  subtitle: { ...textStyles.caption },
  price: { ...textStyles.caption, color: colors.primary, fontWeight: "700" },
  plainPrice: { ...textStyles.caption, color: colors.text, fontWeight: "700" },
  oldPrice: { ...textStyles.caption, textDecorationLine: "line-through" },
  caption: { ...textStyles.caption },
  captionWarning: { color: colors.warning, fontWeight: "600" },
});
