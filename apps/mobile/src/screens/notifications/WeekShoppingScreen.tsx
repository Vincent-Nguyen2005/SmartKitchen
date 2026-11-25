import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, CircleCheck, ShoppingCart } from "lucide-react-native";
import { IconButton, spacing } from "../../theme";
import { useSession } from "../../services/session";
import { CardCaption, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { amountText } from "../shopping-cart/unitDisplay";
import { errorMessage } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { Button, colors, EmptyState, ScreenState, styles } from "./ui";

/** GET /api/menus/week-missing (menu-service): missing ingredients from today through Sunday. */
export type WeekMissingItem = {
  name: string;
  quantity: number;
  unit: string;
  productId: string | null;
  imageUrl: string | null;
  price: number | null;
  discountPercent: number | null;
  saleUnit: string | null;
  /** Word for one piece-type sale unit ("quả", "bìa"); null = the unit's own word. */
  saleUnitLabel?: string | null;
  cartQuantity: number | null;
  unitMismatch: boolean;
};
export type WeekMissing = { from: string; to: string; count: number; items: WeekMissingItem[] };

type Props = {
  onBack: () => void;
  /** After "Thêm vào Giỏ hàng": open Đi chợ on Giỏ hàng. */
  onOpenCart: () => void;
};

/** "500 g", "0,7 kg", "3 quả": the missing amount (in the sale unit's own word when it is that unit). */
const missingText = (item: WeekMissingItem): string => amountText(item.quantity, item.unit, item.unit === item.saleUnit ? item.saleUnitLabel : null);
/** What "Thêm vào Giỏ hàng" puts in the cart: "0,7 kg", "2 gói", "1 quả". */
const buyText = (item: WeekMissingItem): string => amountText(item.cartQuantity ?? 0, item.saleUnit ?? item.unit, item.saleUnitLabel);
const shortDay = (day: string): string => day.slice(5).split("-").reverse().join("/");

/**
 * "Cần mua tuần này": what the family's menus need until Sunday and Kho does not cover. Items not sold in Đi chợ
 * show "Chưa có bán" and are not added. One button puts every purchasable item in Giỏ hàng (missing amount rounded
 * up to the product's sale unit; a line already in the cart is raised to at least that, never doubled).
 */
export default function WeekShoppingScreen({ onBack, onOpenCart }: Props): React.JSX.Element {
  const { api } = useGatewayApi();
  const { family } = useSession();
  const cardGrid = useCardGrid();
  const [data, setData] = useState<WeekMissing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<WeekMissing>("/api/menus/week-missing"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const purchasable = (data?.items ?? []).filter((item) => item.productId && item.saleUnit && item.cartQuantity);
  const addAll = async () => {
    if (!family?.id || purchasable.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      await api.post("/api/shopping-list/items/ensure", {
        familyId: family.id,
        items: purchasable.map((item) => ({
          name: item.name,
          quantity: item.cartQuantity,
          unit: item.saleUnit,
          productId: item.productId,
          unitPrice: item.price,
          discountPercent: item.discountPercent,
          imageUrl: item.imageUrl,
        })),
      });
      onOpenCart();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.row, local.header]}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại Thông báo" onPress={onBack} />
        <View style={local.flex}>
          <Text style={styles.headline} accessibilityRole="header">Cần mua tuần này</Text>
          {data ? <Text style={styles.caption}>Thực đơn từ {shortDay(data.from)} đến {shortDay(data.to)}</Text> : null}
        </View>
      </View>
      {loading ? (
        <ScreenState loading />
      ) : error && !data ? (
        <ScreenState error={error} onRetry={() => void load()} />
      ) : (
        <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          key={`cols-${cardGrid.columns}`}
          data={data?.items ?? []}
          numColumns={cardGrid.columns}
          onLayout={cardGrid.onLayout}
          columnWrapperStyle={cardGrid.columns > 1 ? { gap: cardGrid.gap } : undefined}
          contentContainerStyle={[local.list, { gap: cardGrid.gap }]}
          keyExtractor={(item) => `${item.productId ?? item.name}|${item.unit}`}
          ListEmptyComponent={<EmptyState fill icon={CircleCheck} text="Kho đã đủ nguyên liệu cho thực đơn tuần này." />}
          renderItem={({ item }) => (
            <ProductCard
              width={cardGrid.cardWidth}
              image={item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={cardImageStyle} resizeMode="cover" /> : <ImagePlaceholder />}
              name={item.name}
              subtitle={`Thiếu ${missingText(item)}`}
              // What "Thêm vào Giỏ hàng" puts in the cart: kg in 0.1 steps, packs from their weight (150 g → 2 gói).
              footer={!item.productId ? <CardCaption text="Chưa có bán" warning /> : item.unitMismatch ? <CardCaption text="Kho có nhưng khác đơn vị" /> : item.cartQuantity && item.saleUnit ? <CardCaption text={`Mua ${buyText(item)}`} /> : undefined}
              accessibilityLabel={`${item.name}, thiếu ${missingText(item)}${!item.productId ? ", chưa có bán" : item.cartQuantity && item.saleUnit && !item.unitMismatch ? `, mua ${buyText(item)}` : ""}`}
            />
          )}
        />
      )}
      {data && data.items.length > 0 ? (
        <View style={local.footer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button
            label="Thêm vào Giỏ hàng"
            icon={ShoppingCart}
            onPress={() => void addAll()}
            busy={adding}
            disabled={purchasable.length === 0}
            accessibilityLabel={purchasable.length === 0 ? "Chưa có món nào bán trong Đi chợ" : `Thêm ${purchasable.length} nguyên liệu vào Giỏ hàng`}
          />
        </View>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
