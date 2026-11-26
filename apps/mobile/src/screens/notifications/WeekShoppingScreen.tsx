import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, CircleCheck, ShoppingCart } from "lucide-react-native";
import { IconButton, spacing } from "../../theme";
import { useSession } from "../../services/session";
import { CardCaption, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { errorMessage } from "./gatewayApi";
import { useGatewayApi } from "./useGatewayApi";
import { Button, EmptyState, ScreenState, styles } from "./ui";
import { cartLines, missingLine, skipNote, type WeekMissing } from "./weekShopping";

export type { WeekMissing, WeekMissingItem } from "./weekShopping";

type Props = {
  onBack: () => void;
  /** After "Thêm vào Giỏ hàng": open Đi chợ on Giỏ hàng. */
  onOpenCart: () => void;
};

const shortDay = (day: string): string => day.slice(5).split("-").reverse().join("/");

/**
 * "Cần mua tuần này": what the family's menus need until Sunday and Kho does not cover. Each card has ONE line,
 * the missing amount in the product's sale unit ("Thiếu 6 kg", "Thiếu 2 gói"), and that is exactly what "Thêm vào
 * Giỏ hàng" adds (a line already in the cart is raised to at least that, never doubled). Items not sold in Đi chợ
 * ("Chưa có bán") or not convertible to the sale unit keep their recipe unit, get a short note and are not added.
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

  const purchasable = cartLines(data?.items ?? []);
  const addAll = async () => {
    if (!family?.id || purchasable.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      await api.post("/api/shopping-list/items/ensure", {
        familyId: family.id,
        items: purchasable,
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
          renderItem={({ item }) => {
            // One line: the missing amount in the sale unit (= what goes into Giỏ hàng). A note only for skipped items.
            const note = skipNote(item);
            return (
              <ProductCard
                width={cardGrid.cardWidth}
                image={item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={cardImageStyle} resizeMode="cover" /> : <ImagePlaceholder />}
                name={item.name}
                subtitle={missingLine(item)}
                footer={note ? <CardCaption text={note.text} warning={note.warning} /> : undefined}
                accessibilityLabel={`${item.name}, ${missingLine(item).toLocaleLowerCase("vi")}${note ? `, ${note.text.toLocaleLowerCase("vi")}` : ""}`}
              />
            );
          }}
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
