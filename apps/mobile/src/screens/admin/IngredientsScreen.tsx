import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { BadgePercent, Carrot, EyeOff, Pencil, Plus, Save, Search, SearchX, Trash2, TriangleExclamationPoint, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, AppText, IconButton } from "../../theme";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Badge, Button, colors, Dropdown, Field, looksLikeImageUrl, Pagination, RemoteImage, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";
import { DateField, toDisplayDate } from "./DateField";
import { formatVnd } from "../../services/format";
import { filterByName, loadAllPages } from "../../services/localSearch";
import { useConfirm } from "../../components/ConfirmDialog";
import { safeDelete } from "./safeDelete";
import { isPieceUnit, UNIT_WORDS, unitWord } from "../shopping-cart/unitDisplay";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  defaultUnit: string;
  shelfLifeDays: number | null;
  caloriesPer100g: number | null;
  allergenTags: string[];
  isActive: boolean;
  imageUrl: string | null;
  /** Credit of a Wikimedia Commons image (scripts/fill-catalog-images); cleared by the server when the link changes. */
  imageSource?: string | null;
  imageAuthor?: string | null;
  imageLicense?: string | null;
  /** English alias for Kho photo recognition ("carrot"), optional. */
  englishName?: string | null;
  /** 1-100; set = the ingredient is shown to users as a promotion. */
  discountPercent: number | null;
  /** ISO date (the API returns YYYY-MM-DDT00:00:00.000Z). */
  promoEndDate: string | null;
  /** First day of the discount (ISO date); null on rows saved before start dates existed. */
  promoStartDate?: string | null;
  /** Optional price in whole VND, shown in the user market (Đi chợ). */
  price: number | null;
  /** Grams in one pack / bunch / piece (PACK / PIECE products), for recipe grams <-> packs; null = unknown. */
  packGrams?: number | null;
  /** Grams in one piece (quả / củ / lá) of a KILOGRAM / PACK product, for recipe pieces -> kg / packs; null = unknown. */
  pieceGrams?: number | null;
  /** Word for one piece-type unit ("quả", "bìa"...); null = the unit's own word. */
  unitLabel?: string | null;
};
type SavedIngredient = Ingredient & { promotionSync?: "synced" | "failed" | "none" };

/**
 * Units: the codes shopping-list-service and inventory-service accept (Unit enum), with Vietnamese labels.
 * admin-service stores defaultUnit as free text, so older values (e.g. "g") are kept and shown as they are.
 */
const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "GRAM", label: "g" }, { value: "KILOGRAM", label: "kg" }, { value: "MILLILITER", label: "ml" },
  { value: "LITER", label: "lít" }, { value: "PIECE", label: "cái" }, { value: "PACK", label: "gói" },
  { value: "BOTTLE", label: "chai" }, { value: "CAN", label: "lon" }, { value: "BOX", label: "hộp" },
];
const DEFAULT_UNIT = "GRAM";
const unitLabel = (value: string): string => UNIT_OPTIONS.find((option) => option.value === value)?.label ?? value;
const unitOptionsFor = (current: string) =>
  UNIT_OPTIONS.some((option) => option.value === current) || !current.trim() ? UNIT_OPTIONS : [...UNIT_OPTIONS, { value: current, label: `${current} (giá trị cũ)` }];
const SHELF_LIFE_PICKS = ["3", "7", "14", "30", "90"];
/** Stored as plain lowercase Vietnamese strings in allergenTags (same free-string array as before). */
const ALLERGENS = ["đậu phộng", "hạt cây", "sữa", "trứng", "hải sản", "cá", "đậu nành", "gluten", "mè"];
const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// Allergens field hidden from the form: no service reads allergens yet (data, API and stored values kept).
const SHOW_ALLERGENS = false;

/** credit: the stored image's credit (shown while the link is unchanged). */
type Draft = { id?: string; name: string; category: string; defaultUnit: string; shelfLifeDays: string; caloriesPer100g: string; allergenTags: string[]; otherAllergen: string; imageUrl: string; discountPercent: string; promoStartDate: string; promoEndDate: string; price: string; packGrams: string; pieceGrams: string; unitLabel: string; englishName: string; credit?: { url: string; source: string | null; author: string; license: string } | null; isActive?: boolean };
/** Promotion dates start filled: from today, for DEFAULT_PROMO_DAYS (sent only when there is a % giảm giá). */
/** Units whose weight per unit is worth storing (recipes in grams -> packs in "Cần mua tuần này"). */
const hasPackWeight = (unit: string): boolean => unit === "PACK" || isPieceUnit(unit);
/** Weight field label: grams, or ml for a bottle (Đi chợ shows "1 chai ≈ 500 ml"). */
/** Weight of one piece (quả / củ / lá) for products sold by the kg or the pack that recipes count in pieces. */
const hasPieceWeight = (unit: string): boolean => unit === "KILOGRAM" || unit === "PACK";
const packWeightLabel = (unit: string): string => (unit === "BOTTLE" ? "Thể tích 1 chai (ml)" : "Khối lượng 1 đơn vị (g)");
/** "Gọi 1 đơn vị là": empty = the unit's own word (cái, chai, lon, hộp). */
const unitWordOptions = (unit: string): { value: string; label: string }[] => [
  { value: "", label: `Mặc định (${unitWord(unit)})` },
  ...UNIT_WORDS.map((word) => ({ value: word, label: word })),
];
const newDraft = (): Draft => ({ name: "", category: "", defaultUnit: DEFAULT_UNIT, shelfLifeDays: "", caloriesPer100g: "", allergenTags: [], otherAllergen: "", imageUrl: "", discountPercent: "", promoStartDate: dayFromToday(0), promoEndDate: dayFromToday(DEFAULT_PROMO_DAYS), price: "", packGrams: "", pieceGrams: "", unitLabel: "", englishName: "" });
const toDraft = (item: Ingredient): Draft => ({
  id: item.id, name: item.name, category: item.category, defaultUnit: item.defaultUnit,
  shelfLifeDays: item.shelfLifeDays?.toString() ?? "", caloriesPer100g: item.caloriesPer100g?.toString() ?? "", allergenTags: [...item.allergenTags], otherAllergen: "",
  imageUrl: item.imageUrl ?? "", discountPercent: item.discountPercent?.toString() ?? "",
  promoStartDate: item.promoStartDate?.slice(0, 10) ?? dayFromToday(0), promoEndDate: item.promoEndDate?.slice(0, 10) ?? dayFromToday(DEFAULT_PROMO_DAYS),
  price: item.price?.toString() ?? "", packGrams: item.packGrams?.toString() ?? "", pieceGrams: item.pieceGrams?.toString() ?? "", unitLabel: item.unitLabel ?? "", isActive: item.isActive, englishName: item.englishName ?? "",
  credit: item.imageUrl && item.imageAuthor && item.imageLicense ? { url: item.imageUrl, source: item.imageSource ?? null, author: item.imageAuthor, license: item.imageLicense } : null,
});
const DEFAULT_PROMO_DAYS = 7;
const PROMOTION_SYNC_FAILED = "Đã lưu nguyên liệu, nhưng chưa tạo được khuyến mãi. Thử lưu lại.";
const pad = (value: number) => String(value).padStart(2, "0");
/** Device-local calendar day plus `days`, as YYYY-MM-DD (the server re-checks in Vietnam time). */
const dayFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const percentError = (text: string): string | null => {
  if (!text.trim()) return null;
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= 100 ? null : "Nhập số nguyên từ 1 đến 100.";
};
/** Where a promotion stands today (device day; the server decides in Vietnam time): list label and colours. */
const promotionState = (start: string | null | undefined, end: string | null | undefined): { label: string; color: string; background: string } => {
  const today = dayFromToday(0);
  const startDay = start?.slice(0, 10) ?? null;
  const endDay = end?.slice(0, 10) ?? null;
  if (startDay && today < startDay) return { label: "Sắp diễn ra", color: colors.warning, background: colors.warningSoft };
  if (endDay && today > endDay) return { label: "Hết hạn", color: colors.muted, background: colors.background };
  return { label: "Đang chạy", color: colors.success, background: colors.successSoft };
};
const dateError = (text: string): string | null => {
  if (!text.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text.trim()) || Number.isNaN(Date.parse(text.trim()))) return "Nhập ngày dạng YYYY-MM-DD.";
  return text.trim() < dayFromToday(0) ? "Ngày phải từ hôm nay trở đi." : null;
};
/** Adds `tag` (trimmed) unless it is empty or already there (case-insensitive). */
const withTag = (tags: string[], tag: string): string[] => {
  const cleaned = tags.map((entry) => entry.trim()).filter(Boolean);
  return !tag.trim() || cleaned.some((entry) => sameTag(entry, tag)) ? cleaned : [...cleaned, tag.trim()];
};
const imageUrlError = (text: string): string | null =>
  !text.trim() || looksLikeImageUrl(text) ? null : "Link phải bắt đầu bằng https:// và là địa chỉ công khai.";
const PAGE_SIZE = 10;
/** Rows per request when loading the whole catalog (admin-service caps limit at 100). */
const LOAD_PAGE_SIZE = 100;
const optionalNumber = (value: string): number | null => (value.trim() === "" ? null : Number(value.replace(",", ".")));

export default function IngredientsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter, isWide } = useLayout();
  const grid = useGridCell(columns);
  const [search, setSearch] = useState("");
  const term = search.trim();
  // "Đang dùng" (isActive=true) or "Tất cả"; hidden ingredients appear under "Tất cả" (dimmed).
  const [active, setActive] = useState<"true" | "all">("all");
  // The whole admin catalog (~139 rows, hidden ones too), loaded once and searched / filtered / paged on the device.
  const [all, setAll] = useState<Ingredient[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { confirm, dialog } = useConfirm();
  const requestId = useRef(0);
  const listRef = useRef<FlatList<Ingredient>>(null);

  // Every row once (pages of 100, the endpoint maximum): again only on pull-to-refresh, retry and after an edit.
  // Typing in the search box or switching the filter sends no request.
  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const rows = await loadAllPages((pageNumber) => api.get<Page<Ingredient>>(`/api/admin/ingredients${query({ page: pageNumber, limit: LOAD_PAGE_SIZE })}`));
      if (id !== requestId.current) return;
      setAll(rows);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  // Accent-insensitive name search ("ca rot" finds "Cà rốt") and the "Đang dùng" filter, then pages of PAGE_SIZE.
  const filtered = useMemo(
    () => filterByName(all, term).filter((item) => active === "all" || item.isActive !== false),
    [all, term, active],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shownPage = Math.min(page, totalPages);
  const items = filtered.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
  // A new search or filter starts on the first page.
  useEffect(() => { setPage(1); }, [term, active]);

  const save = async () => {
    if (!draft) return;
    const calories = optionalNumber(draft.caloriesPer100g);
    const shelfLife = optionalNumber(draft.shelfLifeDays);
    if (!draft.name.trim() || !draft.category.trim() || !draft.defaultUnit.trim()) return setFormError("Tên, nhóm và đơn vị là bắt buộc.");
    if (calories !== null && (Number.isNaN(calories) || calories < 0)) return setFormError("Calo phải là số không âm.");
    if (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife < 1 || shelfLife > 3650)) return setFormError("Hạn dùng là số ngày nguyên từ 1 đến 3650.");
    const price = draft.price.trim() === "" ? null : Number(draft.price.trim());
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1_000_000_000)) return setFormError("Giá là số đồng nguyên, không âm.");
    // Pack weight only means something for products sold by the pack / piece; other units clear it.
    const packGrams = hasPackWeight(draft.defaultUnit) && draft.packGrams.trim() !== "" ? Number(draft.packGrams.trim()) : null;
    if (packGrams !== null && (!Number.isInteger(packGrams) || packGrams < 1 || packGrams > 100_000)) return setFormError(draft.defaultUnit === "BOTTLE" ? "Thể tích 1 chai là số ml nguyên, lớn hơn 0." : "Khối lượng 1 đơn vị là số gam nguyên, lớn hơn 0.");
    const pieceGrams = hasPieceWeight(draft.defaultUnit) && draft.pieceGrams.trim() !== "" ? Number(draft.pieceGrams.trim()) : null;
    if (pieceGrams !== null && (!Number.isInteger(pieceGrams) || pieceGrams < 1 || pieceGrams > 100_000)) return setFormError("Khối lượng 1 quả / củ là số gam nguyên, lớn hơn 0.");
    // The unit word only applies to piece-type units; other units clear it.
    const unitLabelValue = isPieceUnit(draft.defaultUnit) && draft.unitLabel ? draft.unitLabel : null;
    const hasDiscount = draft.discountPercent.trim() !== "";
    // Both dates are required with a discount, and the end may not be before the start (the server checks too).
    const windowProblem = !hasDiscount ? null
      : !draft.promoStartDate.trim() || !draft.promoEndDate.trim() ? "Chọn ngày bắt đầu và ngày kết thúc khuyến mãi."
      : draft.promoEndDate.trim() < draft.promoStartDate.trim() ? "Ngày kết thúc phải từ ngày bắt đầu trở đi." : null;
    const promoProblem = imageUrlError(draft.imageUrl) ?? percentError(draft.discountPercent) ?? windowProblem ?? (hasDiscount ? dateError(draft.promoEndDate) : null);
    if (promoProblem) return setFormError(promoProblem);
    const discount = draft.discountPercent.trim() ? Number(draft.discountPercent.trim()) : null;
    const body = {
      name: draft.name.trim(), category: draft.category.trim(), defaultUnit: draft.defaultUnit.trim(),
      caloriesPer100g: calories, shelfLifeDays: shelfLife, price, packGrams, pieceGrams, unitLabel: unitLabelValue,
      // "" clears the alias (the server stores null).
      englishName: draft.englishName.trim() || null,
      // While the field is hidden, allergenTags is not sent: an edit leaves stored allergens untouched
      // (partial update) and a new ingredient gets the server default []. A typed "Khác" value is saved when shown.
      ...(SHOW_ALLERGENS ? { allergenTags: withTag(draft.allergenTags, draft.otherAllergen) } : {}),
      // null clears the value; an empty end date with a discount means "today + 7 days" on the server.
      imageUrl: draft.imageUrl.trim() || null,
      discountPercent: discount,
      promoStartDate: discount !== null && draft.promoStartDate.trim() ? draft.promoStartDate.trim() : null,
      promoEndDate: discount !== null && draft.promoEndDate.trim() ? draft.promoEndDate.trim() : null,
    };
    setSaving(true); setFormError(null);
    try {
      const saved = draft.id
        ? await api.put<SavedIngredient>(`/api/admin/ingredients/${encodeURIComponent(draft.id)}`, body)
        : await api.post<SavedIngredient>("/api/admin/ingredients", body);
      // The ingredient is saved even when the promotion could not be created; tell the admin to retry.
      setNotice(saved.promotionSync === "failed" ? PROMOTION_SYNC_FAILED : null);
      setDraft(null);
      void load(true);
    } catch (caught) {
      setFormError(caught instanceof GatewayApiError && caught.status === 409 ? "Tên nguyên liệu đã tồn tại." : errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const setActiveFlag = async (item: Ingredient, isActive: boolean) => {
    setAll((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isActive } : entry)));
    try {
      const saved = await api.patch<SavedIngredient>(`/api/admin/ingredients/${encodeURIComponent(item.id)}/active`, { isActive });
      setNotice(saved.promotionSync === "failed" ? PROMOTION_SYNC_FAILED : null);
    } catch (caught) {
      setAll((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setError(errorMessage(caught));
    }
  };

  // "Ẩn" / "Xóa" in the edit form. Delete is refused (409 IN_USE) while promotions or shopping lists use the
  // ingredient; the admin can hide it instead. Afterwards the form closes and the current page reloads.
  const hideFromForm = async (id: string) => {
    await api.patch<SavedIngredient>(`/api/admin/ingredients/${encodeURIComponent(id)}/active`, { isActive: false });
  };
  const runFormAction = async (action: () => Promise<boolean>) => {
    setRemoving(true); setFormError(null);
    try {
      if (await action()) { setDraft(null); void load(true); }
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setRemoving(false);
    }
  };
  const hideDraft = (current: Draft) => runFormAction(async () => { if (current.id) await hideFromForm(current.id); return true; });
  const deleteDraft = (current: Draft) => runFormAction(async () => {
    const id = current.id;
    if (!id) return false;
    const result = await safeDelete({
      confirm,
      name: current.name.trim() || "nguyên liệu này",
      inUseText: "Nguyên liệu này đang được dùng nên không xóa được. Bạn có thể ẩn nó.",
      remove: () => api.delete(`/api/admin/ingredients/${encodeURIComponent(id)}`),
      hide: current.isActive === false ? undefined : () => hideFromForm(id),
    });
    if (result.kind === "inUse") setFormError(result.message);
    return result.kind === "deleted" || result.kind === "hidden";
  });

  // Search, add and filter are the list header, so on short screens (phones in landscape) they scroll
  // away with the list. While loading or after an error the list shows the state instead (same requests).
  const showState = loading || Boolean(error && items.length === 0);
  // Hide the filter chips only when the whole catalog is empty ("Tất cả", no search, 0 items). A search or
  // "Đang dùng" with no results keeps them, otherwise there would be no way back to "Tất cả".
  const catalogEmpty = all.length === 0 && !term && active === "all";
  const goToPage = (nextPage: number) => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setPage(nextPage);
  };
  const toolbar = (
    <View>
      <View style={[styles.wrapRow, local.toolbar]}>
        <View style={local.search}><Field label="Tìm nguyên liệu" icon={Search} placeholder="Nhập tên nguyên liệu..." value={search} onChangeText={setSearch} autoCorrect={false} /></View>
        <Button label="Thêm nguyên liệu" icon={Plus} onPress={() => { setFormError(null); setDraft(newDraft()); }} style={local.addButton} />
      </View>
      {catalogEmpty ? null : (
        <Segmented<"true" | "all"> label="Trạng thái" value={active} onChange={setActive}
          options={[{ value: "true", label: "Đang dùng" }, { value: "all", label: "Tất cả" }]} />
      )}
      {error && !showState ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? (
        <View style={[styles.row, local.notice]} accessibilityLiveRegion="polite">
          <AppIcon icon={TriangleExclamationPoint} size="sm" color={colors.warning} />
          <AppText variant="bodySmall" color={colors.warning} style={local.flex}>{notice}</AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={local.flex}
        data={showState ? [] : items}
        key={`cols-${columns}`}
        numColumns={columns}
        onLayout={grid.onLayout}
        columnWrapperStyle={columns > 1 ? { gap: grid.gap } : undefined}
        keyExtractor={(item) => item.id}
        contentContainerStyle={local.listContent}
        ref={listRef}
        refreshControl={showState ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        ListFooterComponent={showState || total === 0 ? undefined : (
          <View style={local.footer}>
            <AppText variant="caption" style={local.pageInfo}>Trang {shownPage} / {totalPages} · {total} nguyên liệu</AppText>
            <Pagination page={shownPage} totalPages={totalPages} onChange={goToPage} disabled={loading} />
          </View>
        )}
        ListEmptyComponent={showState
          ? <ScreenState loading={loading} error={error} onRetry={() => void load()} />
          : <ScreenState empty emptyIcon={term ? SearchX : Carrot} emptyText={term || active !== "all"
            ? "Không tìm thấy nguyên liệu."
            // This is admin-service's master catalog (master_ingredients), not the items users add to their
            // inventory (inventory-service), so it stays empty until an admin adds or imports ingredients.
            : "Danh mục nguyên liệu chuẩn chưa có mục nào. Nguyên liệu người dùng thêm vào kho được lưu riêng và không hiện ở đây — bấm “Thêm nguyên liệu” để tạo danh mục."} />}
        ListHeaderComponent={toolbar}
        renderItem={({ item }) => (
          <View style={[styles.card, local.card, { maxWidth: grid.cellWidth, opacity: item.isActive ? 1 : 0.6 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sửa ${item.name}`}
              onPress={() => { setFormError(null); setDraft(toDraft(item)); }}
              style={({ pressed }) => [styles.spaceBetween, local.editArea, pressed && styles.pressed]}
            >
              <RemoteImage uri={item.imageUrl} size={48} />
              <View style={[local.flex, local.rowText]}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.muted}>{item.category} · {unitLabel(item.defaultUnit)}{item.caloriesPer100g !== null ? ` · ${item.caloriesPer100g} kcal/100g` : ""}{item.price !== null && item.price !== undefined ? ` · ${formatVnd(item.price)}` : ""}</Text>
                {item.discountPercent !== null ? (() => {
                  const state = promotionState(item.promoStartDate, item.promoEndDate);
                  return <Badge label={`Khuyến mãi ${item.discountPercent}% · ${state.label}`} icon={BadgePercent} color={state.color} background={state.background} />;
                })() : null}
              </View>
              <AppIcon icon={Pencil} size="sm" color={colors.muted} />
            </Pressable>
            <View style={styles.spaceBetween}>
              <Text style={styles.muted}>{item.isActive ? "Đang dùng" : "Đã ẩn (xóa mềm)"}</Text>
              <Switch accessibilityLabel={`${item.name}: đang dùng`} value={item.isActive} onValueChange={(value) => void setActiveFlag(item, value)} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
          </View>
        )}
      />

      <Modal visible={draft !== null} animationType="slide" transparent={isWide} onRequestClose={() => setDraft(null)}>
        <SafeAreaView style={[local.modalBackdrop, { backgroundColor: isWide ? colors.overlay : colors.background }]}>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={[local.modalCard, { borderRadius: isWide ? 16 : 0 }]}>
            <View style={[styles.spaceBetween, local.modalHeader]}>
              <Text style={[styles.headline, local.flex]} accessibilityRole="header">{draft?.id ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</Text>
              <IconButton icon={X} accessibilityLabel="Đóng" onPress={() => setDraft(null)} />
            </View>
            {draft ? (
              <>
                <Field label="Tên *" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
                <Field label="Nhóm *" placeholder="rau củ, thịt, ..." value={draft.category} onChangeText={(category) => setDraft({ ...draft, category })} />
                <Field label="Tên tiếng Anh (nhận diện ảnh)" placeholder="Ví dụ: carrot" value={draft.englishName} onChangeText={(englishName) => setDraft({ ...draft, englishName })} autoCapitalize="none" autoCorrect={false} />
                <View style={local.formBlock}>
                  <AppText variant="bodySmall" color={colors.muted}>Đơn vị mặc định *</AppText>
                  <View style={styles.row}>
                    <Dropdown<string> label="Đơn vị" value={draft.defaultUnit} options={unitOptionsFor(draft.defaultUnit)} onChange={(defaultUnit) => setDraft({ ...draft, defaultUnit })} />
                  </View>
                </View>
                <Field label={`Giá (đ / ${unitLabel(draft.defaultUnit)})`} keyboardType="number-pad" placeholder="Không bắt buộc, ví dụ 25000" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^0-9]/g, "") })} />
                {isPieceUnit(draft.defaultUnit) ? (
                  <View style={styles.row}>
                    <Dropdown<string> label="Gọi 1 đơn vị là" value={draft.unitLabel} options={unitWordOptions(draft.defaultUnit)} onChange={(unitLabel) => setDraft({ ...draft, unitLabel })} />
                  </View>
                ) : null}
                {hasPackWeight(draft.defaultUnit) ? (
                  <Field label={packWeightLabel(draft.defaultUnit)} keyboardType="number-pad" placeholder={draft.defaultUnit === "PACK" ? "Không bắt buộc, ví dụ 1 bó hành lá ≈ 100" : "Không bắt buộc, ví dụ 1 quả bưởi ≈ 1200"} value={draft.packGrams} onChangeText={(packGrams) => setDraft({ ...draft, packGrams: packGrams.replace(/[^0-9]/g, "") })} />
                ) : null}
                {hasPieceWeight(draft.defaultUnit) ? (
                  <Field label="Khối lượng 1 quả / củ (g)" keyboardType="number-pad" placeholder="Không bắt buộc, ví dụ 1 quả cà chua ≈ 100" value={draft.pieceGrams} onChangeText={(pieceGrams) => setDraft({ ...draft, pieceGrams: pieceGrams.replace(/[^0-9]/g, "") })} />
                ) : null}
                <Field label="Calo / 100g" keyboardType="decimal-pad" value={draft.caloriesPer100g} onChangeText={(caloriesPer100g) => setDraft({ ...draft, caloriesPer100g })} />
                <Field label="Hạn dùng (ngày)" keyboardType="number-pad" placeholder="1 - 3650, để trống nếu không rõ" value={draft.shelfLifeDays} onChangeText={(shelfLifeDays) => setDraft({ ...draft, shelfLifeDays: shelfLifeDays.replace(/[^0-9]/g, "") })} />
                <Segmented<string> label="Chọn nhanh số ngày" value={draft.shelfLifeDays} onChange={(shelfLifeDays) => setDraft({ ...draft, shelfLifeDays })}
                  options={SHELF_LIFE_PICKS.map((days) => ({ value: days, label: `${days} ngày` }))} />
                {SHOW_ALLERGENS ? (
                  <AllergenPicker
                    value={draft.allergenTags}
                    other={draft.otherAllergen}
                    onChange={(allergenTags) => setDraft({ ...draft, allergenTags })}
                    onOtherChange={(otherAllergen) => setDraft({ ...draft, otherAllergen })}
                  />
                ) : null}

                <Field
                  label="Dán link ảnh (https://...)"
                  value={draft.imageUrl}
                  onChangeText={(imageUrl) => { setImageLoadFailed(false); setDraft({ ...draft, imageUrl }); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://..."
                />
                {draft.imageUrl.trim() ? (
                  looksLikeImageUrl(draft.imageUrl) ? (
                    <View style={[styles.row, local.preview]}>
                      <RemoteImage uri={draft.imageUrl.trim()} size={72} accessibilityLabel="Xem trước ảnh" onLoadError={() => setImageLoadFailed(true)} onLoad={() => setImageLoadFailed(false)} />
                      {imageLoadFailed ? <AppText variant="caption" color={colors.warning} style={local.flex}>Không tải được ảnh, kiểm tra lại link</AppText> : null}
                    </View>
                  ) : <AppText variant="caption" color={colors.danger}>{imageUrlError(draft.imageUrl)}</AppText>
                ) : null}
                {/* Commons credit of the stored image; a new link replaces the image and the server drops this credit. */}
                {draft.credit && draft.imageUrl.trim() === draft.credit.url ? (
                  <View style={local.creditRow}>
                    <AppText variant="caption" color={colors.muted}>Ảnh: {draft.credit.author} · {draft.credit.license} · Wikimedia Commons</AppText>
                    {draft.credit.source ? (
                      <Pressable accessibilityRole="link" onPress={() => { if (draft.credit?.source) void Linking.openURL(draft.credit.source); }}>
                        <AppText variant="caption" color={colors.primary}>Xem nguồn ảnh</AppText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <Field label="% giảm giá (1-100)" keyboardType="number-pad" placeholder="Để trống nếu không khuyến mãi" value={draft.discountPercent} onChangeText={(discountPercent) => setDraft({ ...draft, discountPercent })} />
                {percentError(draft.discountPercent) ? <AppText variant="caption" color={colors.danger}>{percentError(draft.discountPercent)}</AppText> : null}

                <DateField
                  label="Giảm từ ngày *"
                  value={draft.promoStartDate}
                  onChange={(promoStartDate) => setDraft({ ...draft, promoStartDate })}
                  // A running promotion keeps its (past) first day; new ones start today or later.
                  minDate={draft.promoStartDate && draft.promoStartDate < dayFromToday(0) ? draft.promoStartDate : dayFromToday(0)}
                  suggestedDate={dayFromToday(0)}
                  clearable={false}
                  emptyHint="Chỉ dùng khi có % giảm giá."
                />
                <DateField
                  label="Giảm đến ngày *"
                  value={draft.promoEndDate}
                  onChange={(promoEndDate) => setDraft({ ...draft, promoEndDate })}
                  minDate={draft.promoStartDate && draft.promoStartDate > dayFromToday(0) ? draft.promoStartDate : dayFromToday(0)}
                  suggestedDate={dayFromToday(DEFAULT_PROMO_DAYS)}
                  clearable={false}
                  emptyHint={`Mặc định: hôm nay + ${DEFAULT_PROMO_DAYS} ngày (${toDisplayDate(dayFromToday(DEFAULT_PROMO_DAYS))}). Chỉ dùng khi có % giảm giá.`}
                />
                {draft.discountPercent.trim() && draft.promoStartDate && draft.promoEndDate && draft.promoEndDate < draft.promoStartDate
                  ? <AppText variant="caption" color={colors.danger}>Ngày kết thúc phải từ ngày bắt đầu trở đi.</AppText> : null}
                {dateError(draft.promoEndDate) ? <AppText variant="caption" color={colors.danger}>{dateError(draft.promoEndDate)}</AppText> : null}
              </>
            ) : null}
            {formError ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{formError}</Text> : null}
            <View style={[styles.wrapRow, local.modalActions]}>
              {draft?.id ? (
                <View style={[styles.wrapRow, local.destructiveActions]}>
                  {draft.isActive !== false ? <Button variant="secondary" label="Ẩn" icon={EyeOff} onPress={() => void hideDraft(draft)} disabled={removing || saving} /> : null}
                  <Button variant="danger" label="Xóa" icon={Trash2} accessibilityLabel={`Xóa vĩnh viễn ${draft.name}`} onPress={() => void deleteDraft(draft)} busy={removing} disabled={saving} />
                </View>
              ) : null}
              <Button variant="secondary" label="Hủy" onPress={() => setDraft(null)} />
              <Button label="Lưu" icon={Save} onPress={() => void save()} busy={saving} disabled={removing} />
            </View>
          </ScrollView>
          {dialog}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

type AllergenPickerProps = { value: string[]; other: string; onChange: (tags: string[]) => void; onOtherChange: (text: string) => void };

/**
 * "Chất gây dị ứng": fixed chips plus any stored value outside the list (kept selectable), and a "Khác"
 * input for anything else. Values are stored exactly as shown (same string array as before).
 */
function AllergenPicker({ value, other, onChange, onOtherChange }: AllergenPickerProps): React.JSX.Element {
  const extras = value.filter((tag) => !ALLERGENS.some((known) => sameTag(known, tag)));
  const toggle = (tag: string) => onChange(value.some((entry) => sameTag(entry, tag)) ? value.filter((entry) => !sameTag(entry, tag)) : [...value, tag]);
  return (
    <View style={local.formBlock}>
      <AppText variant="bodySmall" color={colors.muted}>Chất gây dị ứng</AppText>
      <View style={styles.wrapRow} accessibilityLabel="Chất gây dị ứng">
        {[...ALLERGENS, ...extras].map((tag) => {
          const selected = value.some((entry) => sameTag(entry, tag));
          return (
            <Pressable
              key={tag}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={tag}
              onPress={() => toggle(tag)}
              style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && !selected && styles.segmentPressed]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.row, local.otherRow]}>
        <View style={local.flex}>
          <Field label="Khác" placeholder="Ví dụ: tôm" value={other} onChangeText={onOtherChange} onSubmitEditing={() => { onChange(withTag(value, other)); onOtherChange(""); }} />
        </View>
        <Button label="Thêm" variant="secondary" disabled={!other.trim()} onPress={() => { onChange(withTag(value, other)); onOtherChange(""); }} style={local.otherButton} />
      </View>
      <AppText variant="caption">Dùng để cảnh báo người dùng bị dị ứng</AppText>
    </View>
  );
}

const local = StyleSheet.create({
  creditRow: { gap: 2 },
  formBlock: { gap: 4, marginBottom: 10 },
  otherRow: { alignItems: "flex-end" },
  otherButton: { marginBottom: 10 },
  toolbar: { alignItems: "flex-end", paddingTop: 8 },
  search: { flexBasis: 200, flexGrow: 1 },
  addButton: { marginBottom: 10 },
  listContent: { gap: 12, paddingBottom: 24 },
  footer: { gap: 4, paddingTop: 4 },
  pageInfo: { textAlign: "center" },
  card: { flex: 1, gap: 8 },
  editArea: { minHeight: 44 },
  rowText: { gap: 4 },
  notice: { alignItems: "flex-start", paddingVertical: 4 },
  preview: { marginBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  modalBackdrop: { flex: 1, justifyContent: "center" },
  modalCard: { alignSelf: "center", backgroundColor: colors.background, gap: 4, maxWidth: 560, padding: 20, width: "100%" },
  modalHeader: { marginBottom: 8 },
  modalActions: { justifyContent: "flex-end", marginTop: 12 },
  // "Ẩn" / "Xóa" sit on the left, away from "Lưu".
  destructiveActions: { marginRight: "auto" },
});
