import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, colors, Field, ScreenState, Segmented, styles, useLayout } from "../notifications/ui";

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

  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      <View style={[styles.wrapRow, { alignItems: "flex-end" }]}>
        <View style={{ flexGrow: 1, minWidth: 200 }}><Field label="Tìm nguyên liệu" placeholder="Không dấu cũng được" value={search} onChangeText={setSearch} autoCorrect={false} /></View>
        <Button label="Thêm nguyên liệu" onPress={() => { setFormError(null); setDraft(emptyDraft); }} style={{ marginBottom: 10 }} />
      </View>
      <Segmented<"true" | "false" | "all"> label="Trạng thái" value={active} onChange={setActive}
        options={[{ value: "true", label: "Đang dùng" }, { value: "false", label: "Đã ẩn" }, { value: "all", label: "Tất cả" }]} />
      {loading || (error && items.length === 0) ? <ScreenState loading={loading} error={error} onRetry={() => void load(1)} /> : (
        <FlatList
          data={items}
          key={`cols-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12 } : undefined}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (items.length < total) void load(page + 1); }}
          ListEmptyComponent={<ScreenState empty emptyText="Không tìm thấy nguyên liệu." />}
          ListHeaderComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
          renderItem={({ item }) => (
            <View style={[styles.card, { flex: 1, opacity: item.isActive ? 1 : 0.6 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Sửa ${item.name}`} onPress={() => { setFormError(null); setDraft(toDraft(item)); }}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>{item.category} · {item.defaultUnit}{item.caloriesPer100g !== null ? ` · ${item.caloriesPer100g} kcal/100g` : ""}</Text>
              </Pressable>
              <View style={[styles.row, { justifyContent: "space-between", marginTop: 8 }]}>
                <Text style={{ color: colors.muted }}>{item.isActive ? "Đang dùng" : "Đã ẩn (xóa mềm)"}</Text>
                <Switch accessibilityLabel={`${item.name}: đang dùng`} value={item.isActive} onValueChange={(value) => void setActiveFlag(item, value)} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={draft !== null} animationType="slide" transparent={isWide} onRequestClose={() => setDraft(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: isWide ? "rgba(0,0,0,0.3)" : colors.background, justifyContent: "center" }}>
          <ScrollView contentContainerStyle={{ alignSelf: "center", backgroundColor: colors.background, borderRadius: isWide ? 16 : 0, gap: 4, maxWidth: 560, padding: 20, width: "100%" }}>
            <Text style={[styles.title, { marginBottom: 12 }]}>{draft?.id ? "Sửa nguyên liệu" : "Thêm nguyên liệu"}</Text>
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
            <View style={[styles.wrapRow, { justifyContent: "flex-end", marginTop: 12 }]}>
              <Button variant="secondary" label="Hủy" onPress={() => setDraft(null)} />
              <Button label="Lưu" onPress={() => void save()} busy={saving} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
