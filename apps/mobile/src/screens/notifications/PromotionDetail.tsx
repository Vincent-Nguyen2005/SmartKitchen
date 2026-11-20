import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Calendar, CircleCheck, CircleExclamationPoint, ShoppingCart, Tag, X } from "lucide-react-native";
import { AppIcon, AppText, IconButton } from "../../theme";
import { useSession } from "../../services/session";
// "Mua" adds to Giỏ hàng (the family shopping list) with the catalog price snapshot when the product is known.
import { addPromotionToCart } from "../shopping-cart/cart";
import { Button, colors, RemoteImage, styles } from "./ui";

/** Promotion detail with "Mua" (opened from a promotion card in the Thông báo list). */
export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  discountInfo: string | null;
  productKeywords: string[];
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
};

const formatDay = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");
/** "20%" (admin ingredient promotions) reads "Giảm 20%"; partner text such as "Mua 1 tặng 1" is shown as-is. */
export const discountLabel = (info: string | null): string | null => (!info ? null : /^\d{1,3}%$/.test(info.trim()) ? `Giảm ${info.trim()}` : info);
/** Shopping-list item name: admin promotions are titled "<ingredient> giảm X%". */
export const itemName = (title: string): string => title.replace(/\s+giảm\s+\d{1,3}%$/i, "").trim() || title;

type PromotionDetailProps = { promotion: Promotion | null; onClose: () => void };

/**
 * Promotion detail. "Mua" adds the product to Giỏ hàng (POST /api/shopping-list/items, quantity 1; same product
 * already in the cart = quantity + 1). The unit and price snapshot come from the catalog product with that name.
 */
export function PromotionDetail({ promotion, onClose }: PromotionDetailProps): React.JSX.Element {
  const { accessToken, family } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  useEffect(() => { setMessage(null); setBusy(false); }, [promotion?.id]);

  const buy = async () => {
    if (!promotion) return;
    if (!accessToken || !family) {
      setMessage({ text: "Bạn cần tham gia một gia đình để thêm vào giỏ hàng.", tone: "error" });
      return;
    }
    const name = itemName(promotion.title);
    setBusy(true); setMessage(null);
    try {
      await addPromotionToCart(accessToken, family.id, name);
      setMessage({ text: `Đã thêm "${name}" vào giỏ hàng.`, tone: "success" });
    } catch (caught) {
      setMessage({ text: caught instanceof Error ? caught.message : "Không thêm được vào giỏ hàng.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const discount = promotion ? discountLabel(promotion.discountInfo) : null;
  return (
    <Modal visible={promotion !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, local.detail]}>
          <View style={styles.spaceBetween}>
            <AppText variant="subheading" accessibilityRole="header" style={local.flex}>Chi tiết khuyến mãi</AppText>
            <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
          </View>
          {promotion ? (
            <ScrollView contentContainerStyle={local.detailBody}>
              <View style={local.detailImage}><RemoteImage uri={promotion.imageUrl} size={160} accessibilityLabel={promotion.title} /></View>
              <AppText variant="heading">{promotion.title}</AppText>
              {discount ? (
                <View style={styles.row}>
                  <AppIcon icon={Tag} size="sm" color={colors.success} />
                  <AppText variant="label" color={colors.success}>{discount}</AppText>
                </View>
              ) : null}
              <View style={styles.row}>
                <AppIcon icon={Calendar} size="sm" color={colors.muted} />
                <AppText variant="caption">Đến hết ngày {formatDay(promotion.endsAt)}</AppText>
              </View>
              {promotion.description ? <AppText variant="body">{promotion.description}</AppText> : null}
              <Button label="Mua" icon={ShoppingCart} onPress={() => void buy()} busy={busy} accessibilityLabel={`Mua: thêm ${itemName(promotion.title)} vào giỏ hàng`} />
              {message ? (
                <View style={[styles.row, local.message]} accessibilityLiveRegion="polite">
                  <AppIcon icon={message.tone === "success" ? CircleCheck : CircleExclamationPoint} size="sm" color={message.tone === "success" ? colors.success : colors.danger} />
                  <AppText variant="bodySmall" color={message.tone === "success" ? colors.success : colors.danger} style={local.flex}>{message.text}</AppText>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 4 },
  detail: { maxWidth: 440 },
  detailBody: { gap: 10, paddingBottom: 4 },
  detailImage: { alignItems: "center" },
  message: { alignItems: "flex-start" },
});
