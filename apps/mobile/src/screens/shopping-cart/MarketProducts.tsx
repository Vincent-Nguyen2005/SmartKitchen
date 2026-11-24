import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BadgePercent, Minus, Plus, ShoppingCart, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { Badge, Pagination, ScreenState } from "../notifications/ui";
import { CardPrice, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { SEARCH_CONTENT_GAP, SearchBar } from "../../components/SearchBar";
import { discountedPrice, formatVnd } from "../../services/format";
import { inventoryApi, type CatalogIngredient, type CatalogPage } from "../inventory/inventoryApi";
import { unitLabel } from "../inventory/catalogSuggest";
import { shoppingUnitLabels } from "./shoppingApi";
import { addToCart, shoppingUnitFor } from "./cart";
import { formatQuantity, parseQuantity, quantityRuleFor, stepQuantity } from "./quantityRule";

type Props = {
  accessToken: string | null;
  familyId: string | null;
  /** Called after a product is added to Giỏ hàng (or its quantity raised), with the toast text. */
  onAdded: (message: string) => void;
  /** Pull-to-refresh for the product list (owned by the screen). */
  refreshControl?: React.ReactElement;
  /** Same horizontal padding as Kho, so the search box and grid line up the same way. */
  horizontalPadding: number;
  onOpenFamily?: () => void;
  /** Changing this reloads the current page in place (auto refresh / pull-to-refresh), keeping search and page. */
  refreshSignal?: number;
  /** Reports whether a catalog request is running, so the parent never starts an overlapping refresh. */
  onLoadingChange?: (loading: boolean) => void;
};

const unitText = (product: CatalogIngredient): string => unitLabel(product.unit);

/** Image link set by the admin, or a neutral placeholder when there is none or it fails to load. */
export function ProductImage({ uri, style }: { uri: string | null | undefined; style: object }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (!uri || failed) {
    return <ImagePlaceholder style={style} />;
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} resizeMode="cover" style={[local.image, style]} accessibilityIgnoresInvertColors />;
}

/** Price line: discounted price with the original struck through, or the plain price. */
function PriceLine({ product }: { product: CatalogIngredient }): React.JSX.Element | null {
  if (product.price === null) return null;
  if (product.discountPercent !== null) {
    return (
      <View style={local.priceRow}>
        <Text style={local.price}>{formatVnd(discountedPrice(product.price, product.discountPercent))}</Text>
        <Text style={local.oldPrice}>{formatVnd(product.price)}</Text>
      </View>
    );
  }
  return <Text style={local.price}>{formatVnd(product.price)}</Text>;
}

/**
 * Đi chợ: active products from Quản trị > Nguyên liệu in a 3/4-column card grid (6 rows per page), added to Giỏ hàng. The search box stays on
 * top (like Kho); the grid scrolls below it as plain mapped Views.
 */
export default function MarketProducts({ accessToken, familyId, onAdded, onOpenFamily, refreshSignal = 0, onLoadingChange, refreshControl, horizontalPadding }: Props): React.JSX.Element {
  const { layout, pageSize, onLayout: onGridLayout, gap, cardWidth } = useCardGrid();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<CatalogIngredient | null>(null);
  // Typed text (kg may hold "1," while typing); the quantity follows the product's rule (kg: 0.1 .. 20, else 1 .. 999).
  const [quantityText, setQuantityText] = useState("1");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Debounce typing; a new search starts again at page 1.
  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // A different column count changes the page size: start again at page 1 so pages stay aligned.
  const lastPageSize = useRef(pageSize);
  useEffect(() => {
    if (lastPageSize.current === pageSize) return;
    lastPageSize.current = pageSize;
    setPage(1);
  }, [pageSize]);

  const lastSignal = useRef(refreshSignal);
  const loadingChange = useRef(onLoadingChange);
  loadingChange.current = onLoadingChange;

  useEffect(() => {
    if (!accessToken) { setLoading(false); setError("Đăng nhập để xem sản phẩm."); return; }
    // A refresh signal reloads quietly: the grid stays as it is (no dimming, no error over existing data).
    const background = lastSignal.current !== refreshSignal && data !== null;
    lastSignal.current = refreshSignal;
    let active = true;
    if (!background) { setLoading(true); setError(null); }
    loadingChange.current?.(true);
    inventoryApi.ingredientCatalog(accessToken, { search: term, page, limit: pageSize })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active && !background) setError(requestError instanceof Error ? requestError.message : "Không tải được sản phẩm.");
      })
      .finally(() => {
        loadingChange.current?.(false);
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // `data` only decides quiet vs. visible loading; it must not trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, term, page, pageSize, reloadKey, refreshSignal]);

  const openProduct = (product: CatalogIngredient) => {
    setSelected(product);
    setQuantityText("1");
    setAddError(null);
  };
  const closeSheet = () => { if (!adding) setSelected(null); };
  const rule = quantityRuleFor(selected ? shoppingUnitFor(selected) : "PIECE");
  const quantity = parseQuantity(quantityText, rule) ?? rule.min;
  const step = (direction: 1 | -1) => setQuantityText(formatQuantity(stepQuantity(quantity, direction, rule)));

  /** "Thêm vào giỏ": the server raises the quantity when the same product + unit is already in the cart. */
  const addSelectedToCart = async () => {
    if (!selected || !accessToken || !familyId) return;
    setAdding(true);
    setAddError(null);
    try {
      await addToCart(accessToken, familyId, { name: selected.name, quantity, product: selected });
      setSelected(null);
      onAdded("Đã thêm vào giỏ hàng");
    } catch (requestError) {
      setAddError(requestError instanceof Error ? requestError.message : "Chưa thêm được vào giỏ hàng. Thử lại nhé.");
    } finally {
      setAdding(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <View style={local.container}>
      <View style={[local.searchHeader, { paddingHorizontal: horizontalPadding }, layout.isWide && local.wide]}>
        <SearchBar accessibilityLabel="Tìm sản phẩm" placeholder="Tìm sản phẩm..." value={search} onChangeText={setSearch} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={[local.content, { paddingHorizontal: horizontalPadding }, layout.isWide && local.wide]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
      {loading && !data ? (
        <ScreenState loading />
      ) : error ? (
        <ScreenState error={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : items.length === 0 ? (
        <ScreenState empty emptyText={term ? "Không có sản phẩm phù hợp." : "Chưa có sản phẩm nào."} />
      ) : (
        <View onLayout={onGridLayout} style={[local.grid, { gap }, loading && local.dimmed]}>
          {items.map((product) => {
            const finalPrice = product.price !== null && product.discountPercent !== null ? discountedPrice(product.price, product.discountPercent) : product.price;
            return (
              <ProductCard
                key={product.id}
                width={cardWidth}
                accessibilityLabel={`${product.name}, ${unitText(product)}, ${finalPrice !== null ? formatVnd(finalPrice) : "chưa có giá"}${product.discountPercent !== null ? `, giảm ${product.discountPercent}%` : ""}`}
                onPress={() => openProduct(product)}
                image={<ProductImage uri={product.imageUrl} style={cardImageStyle} />}
                pill={product.discountPercent !== null ? { label: `-${product.discountPercent}%`, tone: "discount" } : null}
                name={product.name}
                subtitle={unitText(product)}
                footer={<CardPrice
                  price={product.price !== null ? formatVnd(product.price) : null}
                  discountedPrice={product.price !== null && product.discountPercent !== null ? formatVnd(discountedPrice(product.price, product.discountPercent)) : null}
                />}
              />
            );
          })}
        </View>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} disabled={loading} />}
      </ScrollView>

      <Modal animationType="slide" transparent visible={selected !== null} onRequestClose={closeSheet}>
        <View style={local.backdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={closeSheet} style={StyleSheet.absoluteFill} />
          {selected && (
            <View style={[local.sheet, layout.isWide && local.sheetWide]}>
              <View style={local.sheetHeader}>
                <Text style={local.sheetTitle} numberOfLines={2}>{selected.name}</Text>
                <IconButton icon={X} accessibilityLabel="Đóng" onPress={closeSheet} />
              </View>
              <View style={local.sheetRow}>
                <ProductImage uri={selected.imageUrl} style={local.sheetImage} />
                <View style={local.sheetInfo}>
                  <Text style={local.unit}>{unitText(selected)}</Text>
                  <PriceLine product={selected} />
                  {selected.discountPercent !== null && (
                    <Badge label={`Giảm ${selected.discountPercent}%${selected.promoEndDate ? ` đến ${selected.promoEndDate.split("-").reverse().join("/")}` : ""}`} icon={BadgePercent} color={colors.success} background={colors.successSoft} />
                  )}
                </View>
              </View>
              {!familyId ? (
                <View style={local.familyBox}>
                  <Text style={local.helper}>Tạo hoặc tham gia gia đình để thêm sản phẩm vào giỏ hàng.</Text>
                  {onOpenFamily && (
                    <Pressable accessibilityRole="button" onPress={() => { setSelected(null); onOpenFamily(); }} style={local.primaryButton}>
                      <Text style={local.primaryButtonText}>Mở tab Gia đình</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <>
                  <Text style={local.fieldLabel}>Số lượng ({shoppingUnitLabels[shoppingUnitFor(selected)]})</Text>
                  <View style={local.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Giảm số lượng" disabled={quantity <= rule.min || adding} onPress={() => step(-1)} style={[local.stepButton, quantity <= rule.min && local.dimmed]}>
                      <AppIcon icon={Minus} size="md" color={colors.primary} />
                    </Pressable>
                    <TextInput
                      accessibilityLabel="Số lượng"
                      keyboardType={rule.decimals ? "decimal-pad" : "number-pad"}
                      value={quantityText}
                      onChangeText={(text) => setQuantityText(rule.decimals ? text.replace(/[^0-9.,]/g, "") : text.replace(/[^0-9]/g, ""))}
                      onBlur={() => setQuantityText(formatQuantity(quantity))}
                      style={local.stepInput}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel="Tăng số lượng" disabled={quantity >= rule.max || adding} onPress={() => step(1)} style={[local.stepButton, quantity >= rule.max && local.dimmed]}>
                      <AppIcon icon={Plus} size="md" color={colors.primary} />
                    </Pressable>
                    <Text style={local.unit}>{shoppingUnitLabels[shoppingUnitFor(selected)]}</Text>
                  </View>
                  {addError && <Text accessibilityRole="alert" style={local.error}>{addError}</Text>}
                  <Pressable accessibilityRole="button" accessibilityState={{ busy: adding, disabled: adding }} disabled={adding} onPress={() => void addSelectedToCart()} style={[local.primaryButton, adding && local.dimmed]}>
                    {adding ? <ActivityIndicator color={colors.primaryText} /> : <View style={local.buttonContent}><AppIcon icon={ShoppingCart} size="sm" color={colors.primaryText} /><Text style={local.primaryButtonText}>Thêm vào giỏ</Text></View>}
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  container: { flex: 1 },
  // Same placement as Kho's search box (top padding, centred max width on wide screens).
  searchHeader: { paddingTop: spacing.xl, width: "100%" },
  wide: { alignSelf: "center", maxWidth: 920, width: "100%" },
  // SEARCH_CONTENT_GAP above the grid like Kho's list; bottom room for the floating cart button.
  content: { gap: spacing.md, paddingBottom: 96, paddingTop: SEARCH_CONTENT_GAP },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dimmed: { opacity: 0.6 },
  image: { backgroundColor: colors.background },
  unit: { ...textStyles.caption },
  priceRow: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  price: { ...textStyles.labelSmall, color: colors.primary },
  oldPrice: { ...textStyles.caption, textDecorationLine: "line-through" },
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md, padding: spacing.lg, width: "100%" },
  sheetWide: { alignSelf: "center", borderRadius: radius.lg, marginBottom: spacing.xl, maxWidth: 520 },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  sheetTitle: { ...textStyles.heading, flex: 1 },
  sheetRow: { flexDirection: "row", gap: spacing.md },
  sheetImage: { borderRadius: radius.sm, height: 96, width: 96 },
  sheetInfo: { alignItems: "flex-start", flex: 1, gap: spacing.xs, justifyContent: "center" },
  fieldLabel: { ...textStyles.labelSmall, color: colors.muted },
  stepper: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  stepButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: touchTarget, justifyContent: "center", width: touchTarget },
  stepInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontFamily, fontSize: typography.body.fontSize, minHeight: touchTarget, textAlign: "center", width: 64 },
  familyBox: { gap: spacing.sm },
  helper: { ...textStyles.bodySmall, color: colors.muted },
  error: { ...textStyles.bodySmall, color: colors.danger },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  primaryButtonText: { ...textStyles.label, color: colors.primaryText },
});
