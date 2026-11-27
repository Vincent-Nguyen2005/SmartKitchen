/**
 * Memo comparator for Đi chợ product cards (MarketProducts). A card re-renders only when its own product, width,
 * selected state or callbacks change: a selection toggle touches one card, not all ~139. Pure (unit-tested).
 */
export type CardPropsForCompare = {
  product: unknown;
  width: unknown;
  selected: boolean | undefined;
  onPress: unknown;
  onLongPress: unknown;
  /** Automatic promotion tag ("KM −10%"); a string, so equal tags compare equal. */
  promoTag?: string | null;
};

export const sameCardProps = (previous: CardPropsForCompare, next: CardPropsForCompare): boolean =>
  previous.product === next.product &&
  previous.width === next.width &&
  previous.selected === next.selected &&
  previous.onPress === next.onPress &&
  previous.onLongPress === next.onLongPress &&
  (previous.promoTag ?? null) === (next.promoTag ?? null);
