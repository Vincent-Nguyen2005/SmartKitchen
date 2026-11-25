import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BadgePercent, Minus, Plus, ShoppingCart, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { Badge, ScreenState } from "../notifications/ui";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { CardCaption, CardPrice, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { SEARCH_CONTENT_GAP, SearchBar } from "../../components/SearchBar";
import { discountedPrice, formatVnd } from "../../services/format";
import { inventoryApi, type CatalogIngredient } from "../inventory/inventoryApi";
import { addToCart, shoppingUnitFor } from "./cart";
import { formatQuantity, parseQuantity, quantityRuleFor, stepQuantity } from "./quantityRule";
import { neededLabels, orderNeededFirst, type NeededItem } from "./neededFirst";
import { unitLine, unitWord } from "./unitDisplay";

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
  /** Changing this reloads the loaded products in place (auto refresh / pull-to-refresh), keeping search and scroll. */
  refreshSignal?: number;
  /** Reports whether a catalog request is running, so the parent never starts an overlapping refresh. */
  onLoadingChange?: (loading: boolean) => void;
};

/** Products loaded so far (pages 1..page of the current search). */
type Loaded = { items: CatalogIngredient[]; page: number; totalPages: number };
/** This week's missing products: "Thiếu …" per product id (weekly order) and the products themselves. */
type Needed = { labels: Map<string, string>; products: CatalogIngredient[] };
const NO_NEEDED: Needed = { labels: new Map(), products: [] };
/** Room below the last row for the floating cart button (56 px + its margin). */
const LIST_BOTTOM_SPACE = 96;
const NEEDED_REFRESH_MS = 120_000;

/** Unit line under the name: "1 kg", "1 gói", "1 quả ≈ 1,2 kg". */
const unitText = (product: CatalogIngredient): string => unitLine(product);
/** Word for the product's sale unit in the quantity stepper ("kg", "gói", "quả"). */
const saleWord = (product: CatalogIngredient): string => unitWord(shoppingUnitFor(product), product.unitLabel);

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

/** Every page of this week's missing products (catalog `ids` filter, 50 per page, at most 100 ids). */
async function loadNeededProducts(accessToken: string, ids: string[]): Promise<CatalogIngredient[]> {
  const products: CatalogIngredient[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const result = await inventoryApi.ingredientCatalog(accessToken, { ids: ids.slice(0, 100), page, limit: 50 });
    products.push(...result.items);
    if (page >= result.totalPages) break;
  }
  return products;
}

/**
 * Đi chợ: active products from Quản trị > Nguyên liệu in a 3/4-column card grid that loads the next page while
 * scrolling (no pager). Products this week's menus still need (Cần mua tuần này) come first with "Thiếu 0,7 kg",
 * then the rest in the usual order, once. The search box stays on top (like Kho); a new search starts at the top.
 */
export default function MarketProducts({ accessToken, familyId, onAdded, onOpenFamily, refreshSignal = 0, onLoadingChange, refreshControl, horizontalPadding }: Props): React.JSX.Element {
  const { layout, columns, pageSize, onLayout: onGridLayout, gap, cardWidth } = useCardGrid();
  const { api } = useGatewayApi();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [needed, setNeeded] = useState<Needed>(NO_NEEDED);
  const [selected, setSelected] = useState<CatalogIngredient | null>(null);
  // Typed text (kg may hold "1," while typing); the quantity follows the product's rule (kg: 0.1 .. 20, else 1 .. 999).
  const [quantityText, setQuantityText] = useState("1");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const listRef = useRef<FlatList<CatalogIngredient>>(null);

  // Debounce typing.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const lastSignal = useRef(refreshSignal);
  const loadingChange = useRef(onLoadingChange);
  loadingChange.current = onLoadingChange;
  // Bumped by every list (re)load: an older answer, or a "next page" from before a new search, is dropped.
  const generation = useRef(0);

  // First page of a new search / column count / retry (back to the top), or a quiet reload of every loaded page.
  useEffect(() => {
    if (!accessToken) { setLoading(false); setError("Đăng nhập để xem sản phẩm."); return; }
    const background = lastSignal.current !== refreshSignal && loaded !== null;
    lastSignal.current = refreshSignal;
    const current = ++generation.current;
    const pages = background && loaded ? loaded.page : 1;
    if (!background) {
      setLoading(true);
      setError(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    loadingChange.current?.(true);
    (async (): Promise<Loaded> => {
      const items: CatalogIngredient[] = [];
      let last = { page: 1, totalPages: 1 };
      for (let page = 1; page <= pages; page += 1) {
        const result = await inventoryApi.ingredientCatalog(accessToken, { search: term, page, limit: pageSize });
        items.push(...result.items);
        last = { page: result.page, totalPages: result.totalPages };
        if (page >= result.totalPages) break;
      }
      return { items, ...last };
    })()
      .then((result) => {
        if (current !== generation.current) return;
        setLoaded(result);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (current === generation.current && !background) setError(requestError instanceof Error ? requestError.message : "Không tải được sản phẩm.");
      })
      .finally(() => {
        loadingChange.current?.(false);
        if (current === generation.current) setLoading(false);
      });
    // `loaded` only decides quiet vs. visible loading (and how many pages to reload); it must not trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, term, pageSize, reloadKey, refreshSignal]);

  /** Next page when the list nears its end; nothing once every page is loaded. */
  const loadMore = () => {
    if (!accessToken || !loaded || loading || loadingMore || error || loaded.page >= loaded.totalPages) return;
    const current = generation.current;
    setLoadingMore(true);
    loadingChange.current?.(true);
    inventoryApi.ingredientCatalog(accessToken, { search: term, page: loaded.page + 1, limit: pageSize })
      .then((result) => {
        if (current !== generation.current) return;
        setLoaded((previous) => (previous ? { items: [...previous.items, ...result.items], page: result.page, totalPages: result.totalPages } : previous));
      })
      // A failed page is asked again the next time the end is reached.
      .catch(() => undefined)
      .finally(() => {
        loadingChange.current?.(false);
        setLoadingMore(false);
      });
  };

  // This week's missing products (the family's menus vs. Kho). No family or a failed call: the normal list, silently.
  // Refresh ticks ask again at most every NEEDED_REFRESH_MS (the list depends on menus and Kho, not on the cart).
  const neededAt = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!familyId || !accessToken) { setNeeded(NO_NEEDED); neededAt.current = null; return; }
    const key = `${familyId}|${accessToken}`;
    if (neededAt.current?.key === key && Date.now() - neededAt.current.at < NEEDED_REFRESH_MS) return;
    neededAt.current = { key, at: Date.now() };
    let active = true;
    let done = false;
    (async (): Promise<Needed> => {
      const week = await api.get<{ items?: NeededItem[] }>("/api/menus/week-missing");
      const labels = neededLabels(Array.isArray(week?.items) ? week.items : []);
      if (labels.size === 0) return { labels, products: [] };
      return { labels, products: await loadNeededProducts(accessToken, [...labels.keys()]) };
    })()
      .then((result) => { if (active) setNeeded(result); })
      .catch(() => undefined)
      .finally(() => { done = true; });
    // Cancelled before it finished (e.g. a new token): the next run asks again instead of waiting for the throttle.
    return () => { active = false; if (!done) neededAt.current = null; };
  }, [api, familyId, accessToken, refreshSignal]);

  const shown = useMemo(
    () => orderNeededFirst(needed.products, [...needed.labels.keys()], loaded?.items ?? [], term),
    [needed, loaded, term],
  );

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

  const renderProduct = ({ item: product }: { item: CatalogIngredient }) => {
    const finalPrice = product.price !== null && product.discountPercent !== null ? discountedPrice(product.price, product.discountPercent) : product.price;
    const missing = needed.labels.get(product.id);
    return (
      <ProductCard
        width={cardWidth}
        accessibilityLabel={`${product.name}, ${unitText(product)}, ${finalPrice !== null ? formatVnd(finalPrice) : "chưa có giá"}${product.discountPercent !== null ? `, giảm ${product.discountPercent}%` : ""}${missing ? `, ${missing} cho thực đơn tuần này` : ""}`}
        onPress={() => openProduct(product)}
        image={<ProductImage uri={product.imageUrl} style={cardImageStyle} />}
        pill={product.discountPercent !== null ? { label: `-${product.discountPercent}%`, tone: "discount" } : null}
        name={product.name}
        subtitle={unitText(product)}
        footer={(
          <>
            {missing ? <CardCaption text={missing} warning /> : null}
            <CardPrice
              price={product.price !== null ? formatVnd(product.price) : null}
              discountedPrice={product.price !== null && product.discountPercent !== null ? formatVnd(discountedPrice(product.price, product.discountPercent)) : null}
            />
          </>
        )}
      />
    );
  };

  return (
    <View style={local.container}>
      <View style={[local.searchHeader, { paddingHorizontal: horizontalPadding }, layout.isWide && local.wide]}>
        <SearchBar accessibilityLabel="Tìm sản phẩm" placeholder="Tìm sản phẩm..." value={search} onChangeText={setSearch} />
      </View>
      <View style={[local.listArea, { paddingHorizontal: horizontalPadding }, layout.isWide && local.wide]}>
        <FlatList
          ref={listRef}
          // numColumns cannot change on a mounted FlatList.
          key={`cols-${columns}`}
          data={error ? [] : shown}
          numColumns={columns}
          keyExtractor={(product) => product.id}
          renderItem={renderProduct}
          onLayout={onGridLayout}
          columnWrapperStyle={columns > 1 ? { gap } : undefined}
          contentContainerStyle={[local.content, { gap }, (error || shown.length === 0) && local.fill]}
          style={loading && loaded ? local.dimmed : undefined}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator accessibilityLabel="Đang tải thêm sản phẩm" color={colors.primary} style={local.footer} /> : null}
          ListEmptyComponent={
            loading && !loaded ? <ScreenState loading />
              : error ? <ScreenState error={error} onRetry={() => setReloadKey((key) => key + 1)} />
                : <ScreenState empty emptyText={term ? "Không có sản phẩm phù hợp." : "Chưa có sản phẩm nào."} />
          }
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        />
      </View>

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
                  <Text style={local.fieldLabel}>Số lượng ({saleWord(selected)})</Text>
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
                    <Text style={local.unit}>{saleWord(selected)}</Text>
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
  listArea: { flex: 1 },
  // SEARCH_CONTENT_GAP above the grid like Kho's list; bottom room for the floating cart button.
  content: { paddingBottom: LIST_BOTTOM_SPACE, paddingTop: SEARCH_CONTENT_GAP },
  fill: { flexGrow: 1 },
  footer: { paddingVertical: spacing.md },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
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
