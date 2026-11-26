import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Minus, Package, Plus, ShoppingCart, Trash2 } from "lucide-react-native";
import { AppIcon, colors, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useSession } from "../../services/session";
import { formatVnd } from "../../services/format";
import { normalizeVi } from "../inventory/catalogSuggest";
import type { CatalogIngredient } from "../inventory/inventoryApi";
import MarketProducts, { ProductImage } from "./MarketProducts";
import { cartLines, findCatalogProduct, unitPriceOf } from "./cart";
import { cartTotal, lineTotal, unitPriceText } from "./pricing";
import { formatQuantity, quantityRuleFor, stepQuantity } from "./quantityRule";
import { unitWord } from "./unitDisplay";
import { type CheckoutLine, type ShoppingItem, type ShoppingList, shoppingApi } from "./shoppingApi";
import CheckoutSheet from "./CheckoutSheet";
import OrdersScreen from "./OrdersScreen";

/**
 * "market" = Đi chợ product grid (main view); "cart" = Giỏ hàng, opened from the floating cart button.
 * Hidden from the UI (APIs kept in shoppingApi): the "Lưu món để tham khảo" form, usage suggestions,
 * "Tạo danh sách từ thực đơn", per-item "Đã mua"/"Sửa" and "Hoàn tất" list actions.
 */
type ScreenView = "market" | "cart";
/** openCartKey: bump it to show Giỏ hàng (e.g. after "Thêm vào Giỏ hàng" in Thông báo). */
type Props = { onOpenFamily?: () => void; openCartKey?: number };
const AUTO_REFRESH_MS = 30_000;
/** No auto refresh while the user typed in the product search within this window. */
export const TYPING_QUIET_MS = 5_000;

export default function ShoppingCartScreen({ onOpenFamily, openCartKey = 0 }: Props): React.JSX.Element {
  const { family, accessToken, ready } = useSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isWide = width >= 720;
  // Same horizontal padding as Kho, so the shared search box lines up identically.
  const horizontalPadding = isCompact ? spacing.lg : spacing.xl;
  const [view, setView] = useState<ScreenView>(openCartKey > 0 ? "cart" : "market");
  useEffect(() => { if (openCartKey > 0) setView("cart"); }, [openCartKey]);
  // Bumped to make the product grid reload in place (same search text); `force` asks the server even for a fresh copy.
  const [productsRefresh, setProductsRefresh] = useState({ n: 0, force: false });
  const bumpProducts = (force: boolean) => setProductsRefresh((value) => ({ n: value.n + 1, force }));
  const lastTypedAt = useRef(0);
  // Đi chợ selection mode: its bottom bar replaces the floating cart button.
  const [selecting, setSelecting] = useState(false);
  const productsLoading = useRef(false);
  const [pulling, setPulling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  // Current catalog product per normalized name: price for older lines, group and shelf-life for checkout.
  const [catalog, setCatalog] = useState<Record<string, CatalogIngredient | null>>({});
  const lookedUp = useRef(new Set<string>());
  // "Mua" opens the delivery checkout ("Đặt hàng"); "Đơn hàng" lists the family's orders.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const checkingOut = checkoutOpen;

  const loadData = async (showLoading = false) => {
    if (!ready) return;
    if (!family?.id || !accessToken) {
      setLists([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setLists(await shoppingApi.list(accessToken, family.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được giỏ hàng.");
    } finally {
      setLoading(false);
    }
  };

  const listRequest = useRef<Promise<void> | null>(null);
  /** Loads the cart; never overlaps another load (waits for it, then loads fresh data). */
  const fetchData = async (showLoading = false): Promise<void> => {
    if (listRequest.current) await listRequest.current.catch(() => undefined);
    const run = loadData(showLoading);
    listRequest.current = run;
    try { await run; } finally { if (listRequest.current === run) listRequest.current = null; }
  };
  const fetchRef = useRef(fetchData);
  fetchRef.current = fetchData;

  useEffect(() => { void fetchData(true); }, [family?.id, accessToken, ready]);

  // Auto refresh every 30 s while this tab is mounted (= focused) and the app is in the foreground.
  // A tick is skipped while a cart or product request is still running (requests never overlap) and while the user
  // is typing in the product search (TYPING_QUIET_MS after the last keystroke).
  useEffect(() => {
    let appState = AppState.currentState;
    const tick = () => {
      if (appState !== "active" || listRequest.current || productsLoading.current) return;
      if (Date.now() - lastTypedAt.current < TYPING_QUIET_MS) return;
      void fetchRef.current(false);
      setProductsRefresh((value) => ({ n: value.n + 1, force: false }));
    };
    const timer = setInterval(tick, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      const resumed = appState !== "active" && next === "active";
      appState = next;
      if (resumed) tick();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [family?.id, accessToken]);

  const pullToRefresh = async () => {
    setPulling(true);
    bumpProducts(true);
    try { await fetchData(false); } finally { setPulling(false); }
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const handleProductAdded = (message: string) => {
    showToast(message);
    void fetchData(false);
    bumpProducts(false);
  };

  const cart = useMemo(() => cartLines(lists), [lists]);

  // Look up each cart name once in the catalog (accent-insensitive exact name).
  useEffect(() => {
    if (!accessToken) return;
    const missing = new Map<string, string>();
    for (const item of cart) {
      const key = normalizeVi(item.name);
      if (key && !lookedUp.current.has(key) && !missing.has(key)) missing.set(key, item.name);
    }
    for (const [key, name] of missing) {
      lookedUp.current.add(key);
      findCatalogProduct(accessToken, name)
        .then((product) => setCatalog((current) => ({ ...current, [key]: product })))
        // Retried on the next cart change; meanwhile the line shows its snapshot price or "Chưa có giá".
        .catch(() => { lookedUp.current.delete(key); });
    }
  }, [cart, accessToken]);

  const catalogFor = (item: ShoppingItem) => catalog[normalizeVi(item.name)] ?? null;
  // Sum of the rounded line totals shown on the lines (pricing.ts), so Tổng always equals what the lines add up to.
  const total = cartTotal(cart.map((item) => ({ unitPrice: unitPriceOf(item, catalogFor(item)), quantity: item.quantity })));

  const setLocalQuantity = (itemId: string, quantity: number) =>
    setLists((current) => current.map((list) => ({ ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, quantity } : item)) })));

  const changeQuantity = async (item: ShoppingItem, nextQuantity: number) => {
    if (!family?.id || !accessToken || nextQuantity <= 0) return;
    setBusyItemId(item.id);
    setError(null);
    setLocalQuantity(item.id, nextQuantity);
    try {
      await shoppingApi.updateItem(accessToken, family.id, item.id, { quantity: nextQuantity });
    } catch (requestError) {
      setLocalQuantity(item.id, item.quantity);
      setError(requestError instanceof Error ? requestError.message : "Không đổi được số lượng.");
    } finally {
      setBusyItemId(null);
    }
  };

  const removeLine = async (item: ShoppingItem) => {
    if (!family?.id || !accessToken) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      await shoppingApi.deleteItem(accessToken, family.id, item.id);
      await fetchData(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không xóa được món khỏi giỏ hàng.");
    } finally {
      setBusyItemId(null);
    }
  };

  /** Catalog details per cart line for the order: group (Kho category) and shelf life (expiry on delivery). */
  const checkoutLines: CheckoutLine[] = cart.map((item) => {
    const product = catalogFor(item);
    return {
      id: item.id,
      ...(product?.group ? { categoryName: product.group.slice(0, 50) } : {}),
      ...(typeof product?.shelfLifeDays === "number" ? { shelfLifeDays: product.shelfLifeDays } : {}),
    };
  });

  const renderLine = (item: ShoppingItem) => {
    const price = unitPriceOf(item, catalogFor(item));
    const image = item.imageUrl ?? catalogFor(item)?.imageUrl ?? null;
    // "kg", "gói", "quả": the catalog product's own word for piece-type units (unitDisplay.ts).
    const unit = unitWord(item.unit, catalogFor(item)?.unitLabel);
    const busy = busyItemId === item.id || checkingOut;
    // Older rows already marked bought (never synced) can only go through "Mua".
    const locked = item.isPurchased;
    // kg lines: 0.1 kg steps up to 20 kg; other units: ± 1 down to 1, no upper limit for recipe amounts (quantityRule.ts).
    const rule = quantityRuleFor(item.unit);
    const atMin = item.quantity <= rule.min + 1e-9;
    const atMax = rule.decimals && item.quantity >= rule.max - 1e-9;
    return (
      <View key={item.id} style={styles.line}>
        <ProductImage uri={image} style={styles.lineImage} />
        <View style={styles.lineInfo}>
          <Text style={styles.lineName} numberOfLines={2}>{item.name}</Text>
          <Text style={price === null ? styles.noPrice : styles.unitPrice}>
            {price === null ? "Chưa có giá" : unitPriceText(price, unit)}
          </Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Giảm số lượng ${item.name}`}
              disabled={busy || locked || atMin}
              onPress={() => void changeQuantity(item, stepQuantity(item.quantity, -1, rule))}
              style={[styles.stepButton, (busy || locked || atMin) && styles.disabled]}
            >
              <AppIcon icon={Minus} size="sm" color={colors.primary} />
            </Pressable>
            <Text style={styles.quantity}>{formatQuantity(item.quantity)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tăng số lượng ${item.name}`}
              disabled={busy || locked || atMax}
              onPress={() => void changeQuantity(item, stepQuantity(item.quantity, 1, rule))}
              style={[styles.stepButton, (busy || locked || atMax) && styles.disabled]}
            >
              <AppIcon icon={Plus} size="sm" color={colors.primary} />
            </Pressable>
            <Text style={styles.unitText}>{unit}</Text>
          </View>
          {locked && <Text style={styles.noPrice}>Đã mua, chưa vào Kho</Text>}
        </View>
        <View style={styles.lineEnd}>
          <Text style={styles.lineTotal} accessibilityLiveRegion="polite">{formatVnd(lineTotal(price, item.quantity) ?? 0)}</Text>
          {!locked && (
            <IconButton icon={Trash2} accessibilityLabel={`Xóa ${item.name} khỏi giỏ hàng`} color={colors.danger} disabled={busy} onPress={() => void removeLine(item)} />
          )}
        </View>
      </View>
    );
  };

  const refreshControl = <RefreshControl colors={[colors.primary]} tintColor={colors.primary} refreshing={pulling} onRefresh={() => void pullToRefresh()} />;

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.container}>
      {view === "market" ? (
        <>
          <MarketProducts
            accessToken={accessToken}
            familyId={family?.id ?? null}
            onAdded={handleProductAdded}
            onOpenFamily={onOpenFamily}
            refreshSignal={productsRefresh}
            onTyping={() => { lastTypedAt.current = Date.now(); }}
            onSelectionModeChange={setSelecting}
            onLoadingChange={(value) => { productsLoading.current = value; }}
            refreshControl={refreshControl}
            horizontalPadding={horizontalPadding}
          />
          {!selecting && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cart.length ? `Mở giỏ hàng, ${cart.length} món` : "Mở giỏ hàng"}
              onPress={() => setView("cart")}
              style={({ pressed }) => [styles.cartButton, pressed && styles.disabled]}
            >
              <AppIcon icon={ShoppingCart} size="lg" color={colors.primaryText} />
              {cart.length > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cart.length > 99 ? "99+" : cart.length}</Text>
                </View>
              )}
            </Pressable>
          )}
        </>
      ) : (
        <>
          <View style={[styles.cartHeader, isWide && styles.wideContent]}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Quay lại Đi chợ" color={colors.text} onPress={() => setView("market")} />
            <Text style={styles.cartTitle}>Giỏ hàng</Text>
            {family && <IconButton icon={Package} accessibilityLabel="Đơn hàng của gia đình" color={colors.primary} onPress={() => setOrdersOpen(true)} style={styles.ordersButton} />}
          </View>
          {!ready || loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.helper}>Đang tải giỏ hàng...</Text></View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.cartContent, { paddingHorizontal: horizontalPadding }, isWide && styles.wideContent]}
              keyboardShouldPersistTaps="handled"
              refreshControl={refreshControl}
            >
              {!family ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Tạo hoặc tham gia gia đình để dùng giỏ hàng.</Text>
                  {onOpenFamily && <Pressable accessibilityRole="button" onPress={onOpenFamily} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Mở tab Gia đình</Text></Pressable>}
                </View>
              ) : (
                <>
                  {error && <Text accessibilityRole="alert" style={styles.errorBox}>{error}</Text>}
                  {cart.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <AppIcon icon={ShoppingCart} size="xl" color={colors.muted} />
                      <Text style={styles.emptyText}>Giỏ hàng trống</Text>
                      <Pressable accessibilityRole="button" onPress={() => setView("market")} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Xem sản phẩm</Text></Pressable>
                    </View>
                  ) : cart.map(renderLine)}
                </>
              )}
            </ScrollView>
          )}
          {family && cart.length > 0 && (
            <View style={[styles.totalBar, isWide && styles.wideContent]}>
              <Text style={styles.totalText} accessibilityLiveRegion="polite">Tổng: {formatVnd(total)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mua ${cart.length} món, đặt hàng giao tận nơi`}
                accessibilityState={{ busy: checkingOut, disabled: checkingOut }}
                disabled={checkingOut}
                onPress={() => setCheckoutOpen(true)}
                style={[styles.buyButton, checkingOut && styles.disabled]}
              >
                {checkingOut ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryButtonText}>Mua</Text>}
              </Pressable>
            </View>
          )}
        </>
      )}

      {family && accessToken && (
        <>
          <CheckoutSheet
            visible={checkoutOpen}
            familyId={family.id}
            accessToken={accessToken}
            lines={checkoutLines}
            itemCount={cart.length}
            total={total}
            onClose={() => setCheckoutOpen(false)}
            onPlaced={() => { setCheckoutOpen(false); showToast("Đã đặt hàng"); void fetchData(false); }}
          />
          <OrdersScreen visible={ordersOpen} familyId={family.id} accessToken={accessToken} onClose={() => setOrdersOpen(false)} />
        </>
      )}
      {toast && (
        <View pointerEvents="none" style={styles.toastWrap}>
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.toast}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  wideContent: { alignSelf: "center", maxWidth: 920, width: "100%" },
  center: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", padding: spacing.xl },
  helper: { ...textStyles.bodySmall, color: colors.muted },
  // Floating cart: bottom-right inside the screen, so it sits above the app's bottom action bar.
  cartButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 28, bottom: spacing.lg, elevation: 4, height: 56, justifyContent: "center", position: "absolute", right: spacing.lg, shadowColor: colors.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, width: 56 },
  cartBadge: { alignItems: "center", backgroundColor: colors.danger, borderColor: colors.surface, borderRadius: 11, borderWidth: 2, justifyContent: "center", minWidth: 22, paddingHorizontal: spacing.xs, position: "absolute", right: -2, top: -2 },
  cartBadgeText: { ...textStyles.caption, color: colors.surface, fontWeight: "700", lineHeight: 14 },
  cartHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  cartTitle: { ...textStyles.heading, flex: 1 },
  ordersButton: { marginLeft: "auto" },
  cartContent: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.lg },
  line: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, padding: spacing.md },
  lineImage: { borderRadius: radius.sm, height: 64, width: 64 },
  lineInfo: { flex: 1, gap: spacing.xs, minWidth: 0 },
  lineName: { ...textStyles.label },
  unitPrice: { ...textStyles.bodySmall, color: colors.muted },
  noPrice: { ...textStyles.caption, color: colors.warning },
  stepper: { alignItems: "center", flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  stepButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.sm, height: touchTarget, justifyContent: "center", width: touchTarget },
  quantity: { ...textStyles.label, minWidth: 32, textAlign: "center" },
  unitText: { ...textStyles.bodySmall, color: colors.muted },
  lineEnd: { alignItems: "flex-end", gap: spacing.xs },
  lineTotal: { ...textStyles.label, color: colors.primary },
  totalBar: { alignItems: "center", backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  totalText: { ...textStyles.subheading, flexShrink: 1 },
  buyButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, minWidth: 120, paddingHorizontal: spacing.xl },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radius.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  primaryButtonText: { ...textStyles.label, color: colors.primaryText },
  cancelButton: { alignItems: "center", borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  cancelText: { ...textStyles.labelSmall, color: colors.text },
  disabled: { opacity: 0.6 },
  emptyBox: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.md, padding: spacing.xl },
  emptyText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  errorBox: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, overflow: "hidden", padding: spacing.md },
  failedBox: { backgroundColor: colors.warningSoft, borderColor: colors.warning, borderRadius: radius.sm, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  failedTitle: { ...textStyles.bodySmall },
  failedLine: { ...textStyles.bodySmall, color: colors.warning },
  modalBackdrop: { alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.md, maxWidth: 420, padding: spacing.lg, width: "100%" },
  modalTitle: { ...textStyles.heading },
  modalActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  toastWrap: { alignItems: "center", bottom: spacing.xl + 64, left: spacing.lg, position: "absolute", right: spacing.lg },
  toast: { ...textStyles.labelSmall, backgroundColor: colors.text, borderRadius: 20, color: colors.surface, overflow: "hidden", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
