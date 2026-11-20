import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { BadgePercent, Carrot, Pencil, Plus, Save, Search, SearchX, TriangleExclamationPoint, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, AppText, IconButton } from "../../theme";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Badge, Button, colors, Dropdown, Field, looksLikeImageUrl, Pagination, RemoteImage, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";
import { DateField, toDisplayDate } from "./DateField";
import { formatVnd } from "../../services/format";

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
  /** 1-100; set = the ingredient is shown to users as a promotion. */
  discountPercent: number | null;
  /** ISO date (the API returns YYYY-MM-DDT00:00:00.000Z). */
  promoEndDate: string | null;
  /** Optional price in whole VND, shown in the user market (Đi chợ). */
  price: number | null;
};
type SavedIngredient = Ingredient & { promotionSync?: "synced" | "failed" | "none" };

/**
 * Units: the codes shopping-list-service and inventory-service accept (Unit enum), with Vietnamese labels.
 * admin-service stores defaultUnit as free text, so older values (e.g. "g") are kept and shown as they are.
 */
const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "GRAM", label: "g" }, { value: "KILOGRAM", label: "kg" }, { value: "MILLILITER", label: "ml" },
  { value: "LITER", label: "lít" }, { value: "PIECE", label: "cái / quả" }, { value: "PACK", label: "gói / bó" },
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

type Draft = { id?: string; name: string; category: string; defaultUnit: string; shelfLifeDays: string; caloriesPer100g: string; allergenTags: string[]; otherAllergen: string; imageUrl: string; discountPercent: string; promoEndDate: string; price: string };
const emptyDraft: Draft = { name: "", category: "", defaultUnit: DEFAULT_UNIT, shelfLifeDays: "", caloriesPer100g: "", allergenTags: [], otherAllergen: "", imageUrl: "", discountPercent: "", promoEndDate: "", price: "" };
const toDraft = (item: Ingredient): Draft => ({
  id: item.id, name: item.name, category: item.category, defaultUnit: item.defaultUnit,
  shelfLifeDays: item.shelfLifeDays?.toString() ?? "", caloriesPer100g: item.caloriesPer100g?.toString() ?? "", allergenTags: [...item.allergenTags], otherAllergen: "",
  imageUrl: item.imageUrl ?? "", discountPercent: item.discountPercent?.toString() ?? "", promoEndDate: item.promoEndDate?.slice(0, 10) ?? "",
  price: item.price?.toString() ?? "",
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
const optionalNumber = (value: string): number | null => (value.trim() === "" ? null : Number(value.replace(",", ".")));

export default function IngredientsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter, isWide } = useLayout();
  const grid = useGridCell(columns);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  // "Đang dùng" (isActive=true) or "Tất cả"; hidden ingredients appear under "Tất cả" (dimmed).
  const [active, setActive] = useState<"true" | "all">("all");
  const [items, setItems] = useState<Ingredient[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const requestId = useRef(0);
  const listRef = useRef<FlatList<Ingredient>>(null);

  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 400); return () => clearTimeout(timer); }, [search]);

  // One page of PAGE_SIZE at a time (server-side search + filter). The list shows a spinner while a page loads.
  const load = useCallback(async (nextPage: number, refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const fetchPage = (pageNumber: number) => api.get<Page<Ingredient>>(`/api/admin/ingredients${query({ search: term, isActive: active === "all" ? undefined : active, page: pageNumber, limit: PAGE_SIZE })}`);
      let result = await fetchPage(nextPage);
      let shown = nextPage;
      // The page no longer exists (e.g. items were hidden under "Đang dùng"): show the last page instead.
      if (result.items.length === 0 && result.total > 0 && nextPage > 1) {
        shown = Math.ceil(result.total / PAGE_SIZE);
        result = await fetchPage(shown);
      }
      if (id !== requestId.current) return;
      setItems(result.items);
      setPage(shown); setTotal(result.total); setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [active, api, term]);

  useEffect(() => { void load(1); }, [load]);

  const save = async () => {
    if (!draft) return;
    const calories = optionalNumber(draft.caloriesPer100g);
    const shelfLife = optionalNumber(draft.shelfLifeDays);
    if (!draft.name.trim() || !draft.category.trim() || !draft.defaultUnit.trim()) return setFormError("Tên, nhóm và đơn vị là bắt buộc.");
    if (calories !== null && (Number.isNaN(calories) || calories < 0)) return setFormError("Calo phải là số không âm.");
    if (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife < 1 || shelfLife > 3650)) return setFormError("Hạn dùng là số ngày nguyên từ 1 đến 3650.");
    const price = draft.price.trim() === "" ? null : Number(draft.price.trim());
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1_000_000_000)) return setFormError("Giá là số đồng nguyên, không âm.");
    const promoProblem = imageUrlError(draft.imageUrl) ?? percentError(draft.discountPercent) ?? dateError(draft.promoEndDate);
    if (promoProblem) return setFormError(promoProblem);
    const discount = draft.discountPercent.trim() ? Number(draft.discountPercent.trim()) : null;
    const body = {
      name: draft.name.trim(), category: draft.category.trim(), defaultUnit: draft.defaultUnit.trim(),
      caloriesPer100g: calories, shelfLifeDays: shelfLife, price,
      // While the field is hidden, allergenTags is not sent: an edit leaves stored allergens untouched
      // (partial update) and a new ingredient gets the server default []. A typed "Khác" value is saved when shown.
      ...(SHOW_ALLERGENS ? { allergenTags: withTag(draft.allergenTags, draft.otherAllergen) } : {}),
      // null clears the value; an empty end date with a discount means "today + 7 days" on the server.
      imageUrl: draft.imageUrl.trim() || null,
      discountPercent: discount,
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
      void load(page);
    } catch (caught) {
      setFormError(caught instanceof GatewayApiError && caught.status === 409 ? "Tên nguyên liệu đã tồn tại." : errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const setActiveFlag = async (item: Ingredient, isActive: boolean) => {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isActive } : entry)));
    try {
      const saved = await api.patch<SavedIngredient>(`/api/admin/ingredients/${encodeURIComponent(item.id)}/active`, { isActive });
      setNotice(saved.promotionSync === "failed" ? PROMOTION_SYNC_FAILED : null);
    } catch (caught) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setError(errorMessage(caught));
    }
  };

  // Search, add and filter are the list header, so on short screens (phones in landscape) they scroll
  // away with the list. While loading or after an error the list shows the state instead (same requests).
  const showState = loading || Boolean(error && items.length === 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Hide the filter chips only when the whole catalog is empty ("Tất cả", no search, 0 items). A search or
  // "Đang dùng" with no results keeps them, otherwise there would be no way back to "Tất cả".
  const catalogEmpty = total === 0 && !term && active === "all";
  const goToPage = (nextPage: number) => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    void load(nextPage);
  };
  const toolbar = (
    <View>
      <View style={[styles.wrapRow, local.toolbar]}>
        <View style={local.search}><Field label="Tìm nguyên liệu" icon={Search} placeholder="Nhập tên nguyên liệu..." value={search} onChangeText={setSearch} autoCorrect={false} /></View>
        <Button label="Thêm nguyên liệu" icon={Plus} onPress={() => { setFormError(null); setDraft(emptyDraft); }} style={local.addButton} />
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
      <FlatList
        style={local.flex}
        data={showState ? [] : items}
        key={`cols-${columns}`}
        numColumns={columns}
        onLayout={grid.onLayout}
        columnWrapperStyle={columns > 1 ? { gap: grid.gap } : undefined}
        keyExtractor={(item) => item.id}
        contentContainerStyle={local.listContent}
        ref={listRef}
        refreshControl={showState ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void load(page, true)} tintColor={colors.primary} />}
        ListFooterComponent={showState || total === 0 ? undefined : (
          <View style={local.footer}>
            <AppText variant="caption" style={local.pageInfo}>Trang {page} / {totalPages} · {total} nguyên liệu</AppText>
            <Pagination page={page} totalPages={totalPages} onChange={goToPage} disabled={loading} />
          </View>
        )}
        ListEmptyComponent={showState
          ? <ScreenState loading={loading} error={error} onRetry={() => void load(page)} />
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
                {item.discountPercent !== null ? (
                  <Badge label={`Đang khuyến mãi ${item.discountPercent}%`} icon={BadgePercent} color={colors.success} background={colors.successSoft} />
                ) : null}
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
          <ScrollView contentContainerStyle={[local.modalCard, { borderRadius: isWide ? 16 : 0 }]}>
            <View style={[styles.spaceBetween, local.modalHeader]}>
              <Text style={[styles.headline, local.flex]} accessibilityRole="header">{draft?.id ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</Text>
              <IconButton icon={X} accessibilityLabel="Đóng" onPress={() => setDraft(null)} />
            </View>
            {draft ? (
              <>
                <Field label="Tên *" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
                <Field label="Nhóm *" placeholder="rau củ, thịt, ..." value={draft.category} onChangeText={(category) => setDraft({ ...draft, category })} />
                <View style={local.formBlock}>
                  <AppText variant="bodySmall" color={colors.muted}>Đơn vị mặc định *</AppText>
                  <View style={styles.row}>
                    <Dropdown<string> label="Đơn vị" value={draft.defaultUnit} options={unitOptionsFor(draft.defaultUnit)} onChange={(defaultUnit) => setDraft({ ...draft, defaultUnit })} />
                  </View>
                </View>
                <Field label="Giá (đ)" keyboardType="number-pad" placeholder="Không bắt buộc, ví dụ 25000" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^0-9]/g, "") })} />
                <Field label="Calo / 100g" keyboardType="decimal-pad" value={draft.caloriesPer100g} onChangeText={(caloriesPer100g) => setDraft({ ...draft, caloriesPer100g })} />
                <Field label="Hạn dùng (số ngày)" keyboardType="number-pad" placeholder="1 - 3650, để trống nếu không rõ" value={draft.shelfLifeDays} onChangeText={(shelfLifeDays) => setDraft({ ...draft, shelfLifeDays: shelfLifeDays.replace(/[^0-9]/g, "") })} />
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

                <Field label="% giảm giá (1-100)" keyboardType="number-pad" placeholder="Để trống nếu không khuyến mãi" value={draft.discountPercent} onChangeText={(discountPercent) => setDraft({ ...draft, discountPercent })} />
                {percentError(draft.discountPercent) ? <AppText variant="caption" color={colors.danger}>{percentError(draft.discountPercent)}</AppText> : null}

                <DateField
                  label="Giảm đến ngày"
                  value={draft.promoEndDate}
                  onChange={(promoEndDate) => setDraft({ ...draft, promoEndDate })}
                  minDate={dayFromToday(0)}
                  suggestedDate={dayFromToday(DEFAULT_PROMO_DAYS)}
                  emptyHint={`Mặc định: hôm nay + ${DEFAULT_PROMO_DAYS} ngày (${toDisplayDate(dayFromToday(DEFAULT_PROMO_DAYS))}). Chỉ dùng khi có % giảm giá.`}
                />
                {dateError(draft.promoEndDate) ? <AppText variant="caption" color={colors.danger}>{dateError(draft.promoEndDate)}</AppText> : null}
              </>
            ) : null}
            {formError ? <Text style={styles.errorText} accessibilityLiveRegion="assertive">{formError}</Text> : null}
            <View style={[styles.wrapRow, local.modalActions]}>
              <Button variant="secondary" label="Hủy" onPress={() => setDraft(null)} />
              <Button label="Lưu" icon={Save} onPress={() => void save()} busy={saving} />
            </View>
          </ScrollView>
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
});
