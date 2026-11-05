import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Carrot, Pencil, Plus, Save, Search, SearchX, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, IconButton } from "../../theme";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, colors, Field, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  defaultUnit: string;
  shelfLifeDays: number | null;
  caloriesPer100g: number | null;
  allergenTags: string[];
  isActive: boolean;
};

type Draft = { id?: string; name: string; category: string; defaultUnit: string; shelfLifeDays: string; caloriesPer100g: string; allergenTags: string };
const emptyDraft: Draft = { name: "", category: "", defaultUnit: "g", shelfLifeDays: "", caloriesPer100g: "", allergenTags: "" };
const toDraft = (item: Ingredient): Draft => ({
  id: item.id, name: item.name, category: item.category, defaultUnit: item.defaultUnit,
  shelfLifeDays: item.shelfLifeDays?.toString() ?? "", caloriesPer100g: item.caloriesPer100g?.toString() ?? "", allergenTags: item.allergenTags.join(", "),
});
const optionalNumber = (value: string): number | null => (value.trim() === "" ? null : Number(value.replace(",", ".")));

export default function IngredientsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter, isWide } = useLayout();
  const grid = useGridCell(columns);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState<"true" | "false" | "all">("true");
  const [items, setItems] = useState<Ingredient[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 400); return () => clearTimeout(timer); }, [search]);

  const load = useCallback(async (nextPage: number, refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else if (nextPage === 1) setLoading(true);
    try {
      const result = await api.get<Page<Ingredient>>(`/api/admin/ingredients${query({ search: term, isActive: active === "all" ? undefined : active, page: nextPage, limit: 30 })}`);
      if (id !== requestId.current) return;
      setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage); setTotal(result.total); setError(null);
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
    if (shelfLife !== null && (!Number.isInteger(shelfLife) || shelfLife < 0)) return setFormError("Hạn dùng phải là số ngày nguyên không âm.");
    const body = {
      name: draft.name.trim(), category: draft.category.trim(), defaultUnit: draft.defaultUnit.trim(),
      caloriesPer100g: calories, shelfLifeDays: shelfLife,
      allergenTags: draft.allergenTags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    setSaving(true); setFormError(null);
    try {
      if (draft.id) await api.put(`/api/admin/ingredients/${encodeURIComponent(draft.id)}`, body);
      else await api.post("/api/admin/ingredients", body);
      setDraft(null);
      void load(1);
    } catch (caught) {
      setFormError(caught instanceof GatewayApiError && caught.status === 409 ? "Tên nguyên liệu đã tồn tại." : errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const setActiveFlag = async (item: Ingredient, isActive: boolean) => {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isActive } : entry)));
    try {
      await api.patch(`/api/admin/ingredients/${encodeURIComponent(item.id)}/active`, { isActive });
    } catch (caught) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)));
      setError(errorMessage(caught));
    }
  };

  // Search, add and filter are the list header, so on short screens (phones in landscape) they scroll
  // away with the list. While loading or after an error the list shows the state instead (same requests).
  const showState = loading || Boolean(error && items.length === 0);
  const toolbar = (
    <View>
      <View style={[styles.wrapRow, local.toolbar]}>
        <View style={local.search}><Field label="Tìm nguyên liệu" icon={Search} placeholder="Không dấu cũng được" value={search} onChangeText={setSearch} autoCorrect={false} /></View>
        <Button label="Thêm nguyên liệu" icon={Plus} onPress={() => { setFormError(null); setDraft(emptyDraft); }} style={local.addButton} />
      </View>
      <Segmented<"true" | "false" | "all"> label="Trạng thái" value={active} onChange={setActive}
        options={[{ value: "true", label: "Đang dùng" }, { value: "false", label: "Đã ẩn" }, { value: "all", label: "Tất cả" }]} />
      {error && !showState ? <Text style={styles.errorText}>{error}</Text> : null}
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
        refreshControl={showState ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!showState && items.length < total) void load(page + 1); }}
        ListEmptyComponent={showState
          ? <ScreenState loading={loading} error={error} onRetry={() => void load(1)} />
          : <ScreenState empty emptyIcon={term ? SearchX : Carrot} emptyText="Không tìm thấy nguyên liệu." />}
        ListHeaderComponent={toolbar}
        renderItem={({ item }) => (
          <View style={[styles.card, local.card, { maxWidth: grid.cellWidth, opacity: item.isActive ? 1 : 0.6 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sửa ${item.name}`}
              onPress={() => { setFormError(null); setDraft(toDraft(item)); }}
              style={({ pressed }) => [styles.spaceBetween, local.editArea, pressed && styles.pressed]}
            >
              <View style={local.flex}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.muted}>{item.category} · {item.defaultUnit}{item.caloriesPer100g !== null ? ` · ${item.caloriesPer100g} kcal/100g` : ""}</Text>
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
              <Text style={[styles.title, local.flex]} accessibilityRole="header">{draft?.id ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</Text>
              <IconButton icon={X} accessibilityLabel="Đóng" onPress={() => setDraft(null)} />
            </View>
            {draft ? (
              <>
                <Field label="Tên *" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
                <Field label="Nhóm *" placeholder="rau củ, thịt, ..." value={draft.category} onChangeText={(category) => setDraft({ ...draft, category })} />
                <Field label="Đơn vị mặc định *" value={draft.defaultUnit} onChangeText={(defaultUnit) => setDraft({ ...draft, defaultUnit })} />
                <Field label="Calo / 100g" keyboardType="decimal-pad" value={draft.caloriesPer100g} onChangeText={(caloriesPer100g) => setDraft({ ...draft, caloriesPer100g })} />
                <Field label="Hạn dùng (ngày)" keyboardType="number-pad" value={draft.shelfLifeDays} onChangeText={(shelfLifeDays) => setDraft({ ...draft, shelfLifeDays })} />
                <Field label="Dị ứng (phân cách bằng dấu phẩy)" value={draft.allergenTags} onChangeText={(allergenTags) => setDraft({ ...draft, allergenTags })} />
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

const local = StyleSheet.create({
  toolbar: { alignItems: "flex-end", paddingTop: 8 },
  search: { flexBasis: 200, flexGrow: 1 },
  addButton: { marginBottom: 10 },
  listContent: { gap: 12, paddingBottom: 24 },
  card: { flex: 1, gap: 8 },
  editArea: { minHeight: 44 },
  flex: { flex: 1, minWidth: 0 },
  modalBackdrop: { flex: 1, justifyContent: "center" },
  modalCard: { alignSelf: "center", backgroundColor: colors.background, gap: 4, maxWidth: 560, padding: 20, width: "100%" },
  modalHeader: { marginBottom: 8 },
  modalActions: { justifyContent: "flex-end", marginTop: 12 },
});
