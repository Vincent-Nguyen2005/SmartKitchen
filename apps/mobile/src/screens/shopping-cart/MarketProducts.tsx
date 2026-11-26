import React, { memo, Profiler, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BadgePercent, Minus, Plus, ShoppingCart, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { Badge, ScreenState } from "../notifications/ui";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { CardPrice, cardImageStyle, ImagePlaceholder, ProductCard, useCardGrid } from "../../components/ProductCard";
import { SEARCH_CONTENT_GAP, SEARCH_MAX_WIDTH, SearchHeader } from "../../components/SearchBar";
import { discountedPrice, formatVnd } from "../../services/format";
import { type CatalogIngredient } from "../inventory/inventoryApi";
import { marketCatalog } from "../inventory/marketCatalog";
import { filterByName } from "../../services/localSearch";
import { addToCart, shoppingUnitFor } from "./cart";
import { lineTotal, unitPriceAfterDiscount, unitPriceText } from "./pricing";
import { bulkAddQuantity, NO_SELECTION, selectionReducer, tapIntent } from "./selection";
import { marketSelectionBar } from "./selectionBar";
import { sameCardProps } from "./marketCard";
import { formatQuantity, parseQuantity, quantityRuleFor, stepQuantity } from "./quantityRule";
import { neededProductIds, orderNeededFirst, type NeededItem } from "./neededFirst";
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
  /**
   * Changing `n` reloads the catalog in place, keeping search and scroll: `force` (pull-to-refresh, after adding)
   * always asks the server; otherwise (auto refresh) a copy younger than MARKET_CATALOG_MAX_AGE_MS is kept.
   */
  refreshSignal?: { n: number; force: boolean };
  /** Reports whether a catalog request is running, so the parent never starts an overlapping refresh. */
  onLoadingChange?: (loading: boolean) => void;
  /** Called on every keystroke in the search box (the parent pauses its auto refresh while the user types). */
  onTyping?: () => void;
  /** Selection mode started / ended (the parent hides its floating cart button while the selection bar shows). */
  onSelectionModeChange?: (active: boolean) => void;
};

const NO_SIGNAL = { n: 0, force: false };
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

/**
 * Sheet price: the line total for the chosen quantity (unit price after discount × quantity, live while typing), the
 * total before the discount struck through, and the unit price smaller underneath ("300.000đ / kg").
 */
function SheetPrice({ product, quantity }: { product: CatalogIngredient; quantity: number }): React.JSX.Element | null {
  const unitPrice = unitPriceAfterDiscount(product.price, product.discountPercent);
  const total = lineTotal(unitPrice, quantity);
  if (unitPrice === null || total === null) return <Text style={local.unit}>Chưa có giá</Text>;
  const before = product.discountPercent !== null ? lineTotal(product.price, quantity) : null;
  return (
    <View>
      <View style={local.priceRow}>
        <Text accessibilityLiveRegion="polite" style={local.sheetTotal}>{formatVnd(total)}</Text>
        {before !== null && before !== total && <Text style={local.oldPrice}>{formatVnd(before)}</Text>}
      </View>
      <Text style={local.unit}>{unitPriceText(unitPrice, saleWord(product))}</Text>
    </View>
  );
}

type MarketCardProps = {
  product: CatalogIngredient;
  width: React.ComponentProps<typeof ProductCard>["width"];
  /** undefined = not in selection mode; true / false = selected or not. */
  selected: boolean | undefined;
  onPress: (product: CatalogIngredient) => void;
  onLongPress: (product: CatalogIngredient) => void;
};

/**
 * One product card. Memoized (sameCardProps): a selection toggle re-renders only the card whose `selected` changed;
 * the others (and their images) are left alone. Callbacks take the product, so they are the same for every card.
 */
const MarketCard = memo(function MarketCard({ product, width, selected, onPress, onLongPress }: MarketCardProps): React.JSX.Element {
  const finalPrice = product.price !== null && product.discountPercent !== null ? discountedPrice(product.price, product.discountPercent) : product.price;
  return (
    <ProductCard
      width={width}
      accessibilityLabel={`${product.name}, ${unitText(product)}, ${finalPrice !== null ? formatVnd(finalPrice) : "chưa có giá"}${product.discountPercent !== null ? `, giảm ${product.discountPercent}%` : ""}`}
      onPress={() => onPress(product)}
      onLongPress={() => onLongPress(product)}
      selected={selected}
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
}, sameCardProps);

const keyOf = (product: CatalogIngredient): string => product.id;

/** Dev only: logs how long the list takes to render after a selection tap (read it in Metro / logcat). */
const logToggleRender = (startedAt: React.MutableRefObject<number>) => (_id: string, _phase: string, actualDuration: number) => {
  if (!startedAt.current) return;
  console.log(`[perf] Đi chợ toggle: list render ${actualDuration.toFixed(1)} ms, tap → commit ${Date.now() - startedAt.current} ms`);
  startedAt.current = 0;
};

/**
 * Đi chợ: active products from Quản trị > Nguyên liệu in a 3/4-column card grid that loads the next page while
 * scrolling (no pager). Products this week's menus still need (Cần mua tuần này) come first, in that list's order,
 * then the rest in the usual order, once (the amounts are shown in Thông báo › Cần mua tuần này). The search box stays on top (like Kho); a new search starts at the top.
 * The whole catalog (~139 products) is loaded once and searched on the device: typing sends no request.
 */
export default function MarketProducts({ accessToken, familyId, onAdded, onOpenFamily, refreshSignal = NO_SIGNAL, onLoadingChange, onTyping, onSelectionModeChange, refreshControl, horizontalPadding }: Props): React.JSX.Element {
  const { layout, columns, onLayout: onGridLayout, gap, cardWidth } = useCardGrid();
  const { api } = useGatewayApi();
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogIngredient[] | null>(() => (accessToken ? marketCatalog(accessToken).peek() : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // This week's missing products: catalog ids in the weekly order (the products come from the loaded catalog).
  const [neededIds, setNeededIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<CatalogIngredient | null>(null);
  // Typed text (kg may hold "1," while typing); the quantity follows the product's rule (kg: 0.1 .. 20, else 1 .. 999).
  const [quantityText, setQuantityText] = useState("1");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const listRef = useRef<FlatList<CatalogIngredient>>(null);
  // Multi-select (selection.ts): long press starts it; leaving the tab unmounts this screen and clears it.
  const [selection, dispatchSelection] = useReducer(selectionReducer, NO_SELECTION);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const exitSelection = useCallback(() => { setBulkError(null); dispatchSelection({ type: "exit" }); }, []);
  // Lookups per card are O(1); the Set changes only when the selection does.
  const selectedSet = useMemo(() => new Set(selection.ids), [selection.ids]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const toggleStartedAt = useRef(0);
  const selectionChange = useRef(onSelectionModeChange);
  selectionChange.current = onSelectionModeChange;
  useEffect(() => { selectionChange.current?.(selection.active); }, [selection.active]);
  useEffect(() => () => selectionChange.current?.(false), []);
  // Android back leaves selection mode first.
  useEffect(() => {
    if (!selection.active) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { if (!bulkAdding) exitSelection(); return true; });
    return () => subscription.remove();
  }, [selection.active, bulkAdding, exitSelection]);

  const lastSignal = useRef(refreshSignal.n);
  const loadingChange = useRef(onLoadingChange);
  loadingChange.current = onLoadingChange;
  // Bumped by every catalog (re)load: an older answer is dropped.
  const generation = useRef(0);

  // The catalog: once per session (shared with Kho and the cart), again on refresh ticks / pull-to-refresh / retry.
  useEffect(() => {
    if (!accessToken) { setLoading(false); setError("Đăng nhập để xem sản phẩm."); return; }
    const tick = lastSignal.current !== refreshSignal.n;
    lastSignal.current = refreshSignal.n;
    const store = marketCatalog(accessToken);
    const background = tick && store.peek() !== null;
    const current = ++generation.current;
    if (!background) { setLoading(true); setError(null); }
    loadingChange.current?.(true);
    store.get(tick ? { force: refreshSignal.force } : {})
      .then((items) => {
        if (current !== generation.current) return;
        setCatalog(items);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (current === generation.current && !background) setError(requestError instanceof Error ? requestError.message : "Không tải được sản phẩm.");
      })
      .finally(() => {
        loadingChange.current?.(false);
        if (current === generation.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, reloadKey, refreshSignal.n]);

  // A new search shows its results from the top.
  useEffect(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [search]);

  // This week's missing products (the family's menus vs. Kho). No family or a failed call: the normal list, silently.
  // Refresh ticks ask again at most every NEEDED_REFRESH_MS (the list depends on menus and Kho, not on the cart).
  // It never depends on the search text, so typing does not ask /week-missing again.
  const neededAt = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!familyId || !accessToken) { setNeededIds([]); neededAt.current = null; return; }
    const key = `${familyId}|${accessToken}`;
    if (neededAt.current?.key === key && Date.now() - neededAt.current.at < NEEDED_REFRESH_MS) return;
    neededAt.current = { key, at: Date.now() };
    let active = true;
    let done = false;
    api.get<{ items?: NeededItem[] }>("/api/menus/week-missing")
      .then((week) => { if (active) setNeededIds(neededProductIds(Array.isArray(week?.items) ? week.items : [])); })
      .catch(() => undefined)
      .finally(() => { done = true; });
    // Cancelled before it finished (e.g. a new token): the next run asks again instead of waiting for the throttle.
    return () => { active = false; if (!done) neededAt.current = null; };
  }, [api, familyId, accessToken, refreshSignal.n]);

  const shown = useMemo(() => {
    const all = catalog ?? [];
    const neededProducts = neededIds.length > 0 ? all.filter((product) => neededIds.includes(product.id)) : [];
    return orderNeededFirst(neededProducts, neededIds, filterByName(all, search), search);
  }, [catalog, neededIds, search]);

  const openProduct = useCallback((product: CatalogIngredient) => {
    setSelected(product);
    setQuantityText("1");
    setAddError(null);
  }, []);
  // The same two callbacks for every card (they read the selection from a ref), so cards never re-render for them.
  const pressCard = useCallback((product: CatalogIngredient) => {
    if (tapIntent(selectionRef.current) === "toggle") {
      if (__DEV__) toggleStartedAt.current = Date.now();
      dispatchSelection({ type: "tap", id: product.id });
    } else openProduct(product);
  }, [openProduct]);
  const longPressCard = useCallback((product: CatalogIngredient) => {
    if (__DEV__) toggleStartedAt.current = Date.now();
    dispatchSelection({ type: "longPress", id: product.id });
  }, []);
  const closeSheet = () => { if (!adding) setSelected(null); };

  /**
   * "Thêm vào Giỏ hàng" for every selected product with its default quantity (bulkAddQuantity: 0,5 kg or 1). The
   * server raises the quantity of a line already in the cart (same product + unit), so nothing is duplicated.
   */
  const addSelectionToCart = async () => {
    if (!accessToken || !familyId || bulkAdding || selection.ids.length === 0) return;
    const byId = new Map((catalog ?? []).map((product) => [product.id, product]));
    const products = selection.ids.map((id) => byId.get(id)).filter((product): product is CatalogIngredient => !!product);
    setBulkAdding(true);
    setBulkError(null);
    const failedIds: string[] = [];
    for (const product of products) {
      try {
        await addToCart(accessToken, familyId, { name: product.name, quantity: bulkAddQuantity(shoppingUnitFor(product)), product });
      } catch {
        failedIds.push(product.id);
      }
    }
    setBulkAdding(false);
    const added = products.length - failedIds.length;
    if (added > 0) onAdded(`Đã thêm ${added} sản phẩm vào Giỏ hàng`);
    if (failedIds.length === 0) { setBulkError(null); dispatchSelection({ type: "exit" }); return; }
    // Failed products stay selected so "Thêm vào Giỏ hàng" can be tried again.
    dispatchSelection({ type: "exit" });
    failedIds.forEach((id, index) => dispatchSelection(index === 0 ? { type: "longPress", id } : { type: "tap", id }));
    setBulkError(`Chưa thêm được ${failedIds.length} sản phẩm. Thử lại nhé.`);
  };
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

  const renderProduct = useCallback(
    ({ item }: { item: CatalogIngredient }) => (
      <MarketCard product={item} width={cardWidth} selected={selection.active ? selectedSet.has(item.id) : undefined} onPress={pressCard} onLongPress={longPressCard} />
    ),
    [cardWidth, selection.active, selectedSet, pressCard, longPressCard],
  );

  // App.tsx shows the one-line selection bar (in place of the capture bar) from this store.
  const addRef = useRef<() => void>(() => undefined);
  addRef.current = () => { void addSelectionToCart(); };
  useEffect(() => {
    if (!selection.active) { marketSelectionBar.clear(); return; }
    marketSelectionBar.publish(
      { active: true, count: selection.ids.length, busy: bulkAdding, canAdd: !!familyId && selection.ids.length > 0 && !bulkAdding },
      { onExit: () => { if (!bulkAdding) exitSelection(); }, onAdd: () => addRef.current() },
    );
  }, [selection.active, selection.ids.length, bulkAdding, familyId, exitSelection]);
  useEffect(() => () => marketSelectionBar.clear(), []);

  return (
    <View style={local.container}>
      <SearchHeader horizontalPadding={horizontalPadding} wide={layout.isWide} accessibilityLabel="Tìm sản phẩm" placeholder="Tìm sản phẩm..." value={search} onChangeText={(text) => { setSearch(text); onTyping?.(); }} />
      {/* A tap on empty space (not on a card) leaves selection mode. */}
      <Pressable accessible={false} onPress={selection.active && !bulkAdding ? exitSelection : undefined} style={[local.listArea, { paddingHorizontal: horizontalPadding }, layout.isWide && local.wide]}>
        {(bulkError || (selection.active && !familyId)) && (
          <Text accessibilityRole="alert" style={[local.error, local.selectionNotice]}>{bulkError ?? "Tạo hoặc tham gia gia đình để thêm vào giỏ hàng."}</Text>
        )}
        <Profiler id="market-list" onRender={__DEV__ ? logToggleRender(toggleStartedAt) : () => undefined}>
        <FlatList
          ref={listRef}
          // numColumns cannot change on a mounted FlatList.
          key={`cols-${columns}`}
          data={error ? [] : shown}
          numColumns={columns}
          keyExtractor={keyOf}
          renderItem={renderProduct}
          // A few screens of rows, not the default 21: fewer mounted cards to keep in sync.
          initialNumToRender={columns * 4}
          maxToRenderPerBatch={columns * 4}
          windowSize={7}
          removeClippedSubviews={Platform.OS === "android"}
          onLayout={onGridLayout}
          columnWrapperStyle={columns > 1 ? { gap } : undefined}
          // Room for the floating cart button; in selection mode it is hidden and the bar sits below the list.
          contentContainerStyle={[local.content, { gap }, selection.active && local.contentSelecting, (error || shown.length === 0) && local.fill]}
          style={loading && catalog ? local.dimmed : undefined}
          ListEmptyComponent={
            loading && !catalog ? <ScreenState loading />
              : error ? <ScreenState error={error} onRetry={() => setReloadKey((key) => key + 1)} />
                : <ScreenState empty emptyText={search.trim() ? "Không có sản phẩm phù hợp." : "Chưa có sản phẩm nào."} />
          }
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        />
        </Profiler>
      </Pressable>


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
                  <SheetPrice product={selected} quantity={familyId ? quantity : 1} />
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
  wide: { alignSelf: "center", maxWidth: SEARCH_MAX_WIDTH, width: "100%" },
  listArea: { flex: 1 },
  contentSelecting: { paddingBottom: spacing.lg },
  selectionNotice: { paddingTop: spacing.sm },
  // SEARCH_CONTENT_GAP above the grid like Kho's list; bottom room for the floating cart button.
  content: { paddingBottom: LIST_BOTTOM_SPACE, paddingTop: SEARCH_CONTENT_GAP },
  fill: { flexGrow: 1 },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dimmed: { opacity: 0.6 },
  image: { backgroundColor: colors.background },
  unit: { ...textStyles.caption },
  priceRow: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  price: { ...textStyles.labelSmall, color: colors.primary },
  sheetTotal: { ...textStyles.subheading, color: colors.primary },
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
