import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BadgePercent, ImageOff, Minus, Plus, Search, X } from "lucide-react-native";
import { AppIcon, colors, fontFamily, IconButton, radius, spacing, textStyles, touchTarget, typography } from "../../theme";
import { Badge, Field, Pagination, ScreenState, Segmented, styles as ui, useGridCell, useLayout } from "../notifications/ui";
import { discountedPrice, formatVnd } from "../../services/format";
import { inventoryApi, type CatalogIngredient, type CatalogPage } from "../inventory/inventoryApi";
import { normalizeVi, unitFromCatalog } from "../inventory/catalogSuggest";
import { shoppingApi, shoppingUnitLabels, type ShoppingList, type ShoppingUnit } from "./shoppingApi";

const PAGE_SIZE = 20;
const ALL_GROUPS = "__all__";

type Props = {
  accessToken: string | null;
  familyId: string | null;
  /** Active shopping lists, used to merge a product that is already on the list. */
  lists: ShoppingList[];
  /** Called after an item is added or merged, with the toast text. */
  onAdded: (message: string) => void;
  onOpenFamily?: () => void;
  /** Changing this reloads the current page in place (auto refresh / pull-to-refresh), keeping search and page. */
  refreshSignal?: number;
  /** Reports whether a catalog request is running, so the parent never starts an overlapping refresh. */
  onLoadingChange?: (loading: boolean) => void;
};

/** Shopping-list unit for a catalog product; admin units are codes or older labels such as "g". */
const shoppingUnitFor = (product: CatalogIngredient): ShoppingUnit => unitFromCatalog(product.unit) ?? "PIECE";
const unitText = (product: CatalogIngredient): string => {
  const code = unitFromCatalog(product.unit);
  return code ? shoppingUnitLabels[code] : product.unit;
};

/** Image link set by the admin, or a neutral placeholder when there is none or it fails to load. */
function ProductImage({ uri, style }: { uri: string | null; style: object }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  if (!uri || failed) {
    return <View style={[local.imagePlaceholder, style]}><AppIcon icon={ImageOff} size="lg" color={colors.muted} /></View>;
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
 * "Sản phẩm" segment of Đi chợ: active products from Quản trị > Nguyên liệu, 20 per page, added to the family
 * shopping list. Plain mapped Views (no FlatList) because the parent screen is a ScrollView.
 */
export default function MarketProducts({ accessToken, familyId, lists, onAdded, onOpenFamily, refreshSignal = 0, onLoadingChange }: Props): React.JSX.Element {
  const layout = useLayout();
  const columns = layout.columns + 1; // 2 on phones, 3 on wide, 4 on extra-wide screens
  const grid = useGridCell(columns, spacing.md);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [group, setGroup] = useState<string>(ALL_GROUPS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CatalogPage | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<CatalogIngredient | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Debounce typing; a new search, group or sale filter starts again at page 1.
  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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
    inventoryApi.ingredientCatalog(accessToken, { search: term, group: group === ALL_GROUPS ? undefined : group, page, limit: PAGE_SIZE })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
        if (Array.isArray(result.groups)) setGroups(result.groups);
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
  }, [accessToken, term, group, page, reloadKey, refreshSignal]);

  const chooseGroup = (value: string) => { setGroup(value); setPage(1); };

  const openProduct = (product: CatalogIngredient) => {
    setSelected(product);
    setQuantity(1);
    setAddError(null);
  };
  const closeSheet = () => { if (!adding) setSelected(null); };

  /** Adds the product, or raises the quantity of the same unpurchased item (same name and unit) already listed. */
  const addToList = async () => {
    if (!selected || !accessToken || !familyId) return;
    const unit = shoppingUnitFor(selected);
    const name = normalizeVi(selected.name);
    const existing = lists
      .filter((list) => list.status === "ACTIVE")
      .flatMap((list) => list.items)
      .find((item) => !item.isPurchased && item.unit === unit && normalizeVi(item.name) === name);
    setAdding(true);
    setAddError(null);
    try {
      if (existing) await shoppingApi.updateItem(accessToken, familyId, existing.id, { quantity: existing.quantity + quantity });
      else await shoppingApi.addItem(accessToken, { familyId, name: selected.name, quantity, unit });
      setSelected(null);
      onAdded("Đã thêm vào Cần mua");
    } catch (requestError) {
      setAddError(requestError instanceof Error ? requestError.message : "Chưa thêm được vào danh sách. Thử lại nhé.");
    } finally {
      setAdding(false);
    }
  };

  const items = data?.items ?? [];
  const cardWidth = grid.cellWidth ?? `${Math.floor(100 / columns) - 2}%`;

  return (
    <View style={local.container}>
      <Field label="Tìm sản phẩm" icon={Search} placeholder="Tìm sản phẩm..." value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
      {/* Group chips only help when there is more than one group. */}
      {groups.length > 1 && (
        <Segmented<string>
          label="Nhóm sản phẩm"
          value={group}
          onChange={chooseGroup}
          options={[{ value: ALL_GROUPS, label: "Tất cả" }, ...groups.map((name) => ({ value: name, label: name }))]}
        />
      )}

      {loading && !data ? (
        <ScreenState loading />
      ) : error ? (
        <ScreenState error={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : items.length === 0 ? (
        <ScreenState empty emptyText={term || group !== ALL_GROUPS ? "Không có sản phẩm phù hợp." : "Chưa có sản phẩm nào."} />
      ) : (
        <View onLayout={grid.onLayout} style={[local.grid, { gap: grid.gap }, loading && local.dimmed]}>
          {items.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, ${unitText(product)}${product.price !== null ? `, ${formatVnd(product.discountPercent !== null ? discountedPrice(product.price, product.discountPercent) : product.price)}` : ""}${product.discountPercent !== null ? `, giảm ${product.discountPercent}%` : ""}`}
              onPress={() => openProduct(product)}
              style={({ pressed }) => [local.card, { width: cardWidth }, pressed && ui.pressed]}
            >
              <View>
                <ProductImage uri={product.imageUrl} style={local.cardImage} />
                {product.discountPercent !== null && (
                  <View style={local.badgeSpot}>
                    <Badge label={`Giảm ${product.discountPercent}%`} color={colors.success} background={colors.successSoft} />
                  </View>
                )}
              </View>
              <View style={local.cardBody}>
                <Text style={local.name} numberOfLines={2}>{product.name}</Text>
                <Text style={local.unit} numberOfLines={1}>{unitText(product)}</Text>
                <PriceLine product={product} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} disabled={loading} />}

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
                  <Text style={local.unit}>{selected.group} · {unitText(selected)}</Text>
                  <PriceLine product={selected} />
                  {selected.discountPercent !== null && (
                    <Badge label={`Giảm ${selected.discountPercent}%${selected.promoEndDate ? ` đến ${selected.promoEndDate.split("-").reverse().join("/")}` : ""}`} icon={BadgePercent} color={colors.success} background={colors.successSoft} />
                  )}
                </View>
              </View>
              {!familyId ? (
                <View style={local.familyBox}>
                  <Text style={local.helper}>Tạo hoặc tham gia gia đình để thêm sản phẩm vào danh sách đi chợ.</Text>
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
                    <Pressable accessibilityRole="button" accessibilityLabel="Giảm số lượng" disabled={quantity <= 1 || adding} onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={[local.stepButton, quantity <= 1 && local.dimmed]}>
                      <AppIcon icon={Minus} size="md" color={colors.primary} />
                    </Pressable>
                    <TextInput
                      accessibilityLabel="Số lượng"
                      keyboardType="number-pad"
                      value={String(quantity)}
                      onChangeText={(text) => { const value = Number(text.replace(/[^0-9]/g, "")); setQuantity(Number.isFinite(value) && value > 0 ? Math.min(value, 999) : 1); }}
                      style={local.stepInput}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel="Tăng số lượng" disabled={quantity >= 999 || adding} onPress={() => setQuantity((value) => Math.min(999, value + 1))} style={local.stepButton}>
                      <AppIcon icon={Plus} size="md" color={colors.primary} />
                    </Pressable>
                    <Text style={local.unit}>{shoppingUnitLabels[shoppingUnitFor(selected)]}</Text>
                  </View>
                  {addError && <Text accessibilityRole="alert" style={local.error}>{addError}</Text>}
                  <Pressable accessibilityRole="button" accessibilityState={{ busy: adding, disabled: adding }} disabled={adding} onPress={() => void addToList()} style={[local.primaryButton, adding && local.dimmed]}>
                    {adding ? <ActivityIndicator color={colors.primaryText} /> : <Text style={local.primaryButtonText}>Thêm vào danh sách</Text>}
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
  container: { gap: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dimmed: { opacity: 0.6 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  cardImage: { aspectRatio: 1, width: "100%" },
  badgeSpot: { left: spacing.xs, position: "absolute", top: spacing.xs },
  cardBody: { gap: spacing.xs, padding: spacing.sm },
  image: { backgroundColor: colors.background },
  imagePlaceholder: { alignItems: "center", backgroundColor: colors.background, justifyContent: "center" },
  name: { ...textStyles.labelSmall },
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
