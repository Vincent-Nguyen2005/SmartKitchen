import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BadgePercent, CalendarDays, Check, CircleCheck, CircleOff, Clock, Pencil, Plus, Power, Search, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage, GatewayApiError } from "../notifications/gatewayApi";
import { Badge, Button, colors, ScreenState, Segmented, styles, useLayout } from "../notifications/ui";
import { DateField } from "./DateField";
import {
  conditionText, emptyForm, formErrors, formFromPromotion, periodText, scopeText, SCOPE_OPTIONS, serverFieldErrors, STATUS_LABELS,
  toPayload, TYPE_OPTIONS, valueText, vnToday, type CheckoutPromotion, type FormErrors, type PromotionForm, type PromotionScope, type PromotionStatus, type PromotionType,
} from "./promotions";

const BASE = "/api/shopping-list/admin/promotions";
type CatalogProduct = { id: string; name: string; group: string };
const STATUS_ICONS: Record<PromotionStatus, LucideIcon> = { RUNNING: CircleCheck, UPCOMING: Clock, ENDED: CalendarDays, OFF: CircleOff };
const toneColors = (tone: "success" | "primary" | "muted" | "danger") => ({
  success: { color: colors.success, background: colors.successSoft },
  primary: { color: colors.primary, background: colors.primarySoft },
  muted: { color: colors.muted, background: colors.background },
  danger: { color: colors.danger, background: colors.dangerSoft },
}[tone]);

/**
 * Quản trị › "Chương trình khuyến mãi": promotions applied automatically at checkout (no code; the one with the
 * largest discount wins). List with status (Đang chạy / Sắp diễn ra / Hết hạn / Tắt), create, edit, turn off / on.
 * shopping-list-service checks the ADMIN role, validates again and writes the audit log.
 */
export default function PromotionsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [items, setItems] = useState<CheckoutPromotion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ promotion: CheckoutPromotion | null } | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setItems((await api.get<{ data: { items: CheckoutPromotion[] } }>(BASE)).data.items);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (promotion: CheckoutPromotion) => {
    const turningOff = promotion.isActive;
    const ok = await confirm(turningOff
      ? { title: `Tắt "${promotion.name}"?`, message: "Đơn mới sẽ không được giảm nữa. Đơn đã đặt giữ nguyên số tiền.", confirmLabel: "Tắt", destructive: true }
      : { title: `Bật lại "${promotion.name}"?`, confirmLabel: "Bật" });
    if (!ok) return;
    setBusyId(promotion.id);
    try {
      await api.patch(`${BASE}/${encodeURIComponent(promotion.id)}/active`, { isActive: !turningOff });
      setNotice(turningOff ? "Đã tắt chương trình." : "Đã bật chương trình.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[local.content, { paddingHorizontal: gutter }]}
        ListHeaderComponent={
          <View style={local.headerBlock}>
            <Text style={local.heading} accessibilityRole="header">Chương trình khuyến mãi</Text>
            <Text style={local.meta}>Tự động áp dụng khi đặt hàng, không cần mã. Mỗi đơn chỉ nhận một chương trình giảm nhiều nhất.</Text>
            <Button label="Tạo chương trình" icon={Plus} onPress={() => { setNotice(null); setEditing({ promotion: null }); }} />
            {notice ? <Text style={local.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
            {error && items ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={<ScreenState loading={items === null && !error} error={items === null ? error : null} empty={items !== null} emptyText="Chưa có chương trình khuyến mãi" emptyIcon={BadgePercent} onRetry={() => void load()} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const status = STATUS_LABELS[item.status];
          const tone = toneColors(status.tone);
          const conditions = conditionText(item);
          return (
            <View style={local.card}>
              <View style={local.cardTop}>
                <View style={local.avatar}><AppIcon icon={BadgePercent} color={colors.primary} /></View>
                <View style={local.flex}>
                  <Text style={local.name} numberOfLines={2}>{item.name}</Text>
                  <Text style={local.value}>{valueText(item)}</Text>
                </View>
                <Badge label={status.label} color={tone.color} background={tone.background} icon={STATUS_ICONS[item.status]} />
              </View>
              <Text style={local.meta} numberOfLines={2}>{scopeText(item)}{conditions ? ` · ${conditions}` : ""}</Text>
              <View style={local.row}><AppIcon icon={CalendarDays} size="sm" color={colors.muted} /><Text style={local.meta}>{periodText(item.startDate, item.endDate)}</Text></View>
              <View style={local.actions}>
                <Button variant="secondary" icon={Pencil} label="Sửa" onPress={() => { setNotice(null); setEditing({ promotion: item }); }} style={local.flex} />
                <Button variant={item.isActive ? "danger" : "secondary"} icon={Power} label={item.isActive ? "Tắt" : "Bật"} busy={busyId === item.id} onPress={() => void toggle(item)} style={local.flex} />
              </View>
            </View>
          );
        }}
      />
      <PromotionFormSheet
        state={editing}
        onClose={() => setEditing(null)}
        onSaved={(created) => { setEditing(null); setNotice(created ? "Đã tạo chương trình. Người dùng sẽ thấy nó trong Thông báo." : "Đã lưu thay đổi."); void load(); }}
      />
      {dialog}
    </View>
  );
}

function PromotionFormSheet({ state, onClose, onSaved }: { state: { promotion: CheckoutPromotion | null } | null; onClose: () => void; onSaved: (created: boolean) => void }): React.JSX.Element {
  const { api } = useGatewayApi();
  const [form, setForm] = useState<PromotionForm>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<{ products: CatalogProduct[]; groups: string[] } | null>(null);
  const isNew = !state?.promotion;
  const today = vnToday();

  useEffect(() => {
    if (!state) return;
    setForm(state.promotion ? formFromPromotion(state.promotion) : emptyForm());
    setErrors({}); setShowErrors(false); setSaveError(null);
  }, [state]);

  // Groups and products for GROUP / PRODUCTS (the market catalog, ~150 products: up to 4 pages of 50).
  useEffect(() => {
    if (!state || catalog) return;
    let active = true;
    void (async () => {
      const products: CatalogProduct[] = [];
      let groups: string[] = [];
      try {
        for (let page = 1; page <= 4; page += 1) {
          const body = await api.get<{ items: CatalogProduct[]; groups: string[]; totalPages: number }>(`/api/admin/catalog/ingredients?limit=50&page=${page}`);
          products.push(...body.items.map((item) => ({ id: item.id, name: item.name, group: item.group })));
          groups = body.groups;
          if (page >= body.totalPages) break;
        }
        if (active) setCatalog({ products, groups });
      } catch {
        if (active) setCatalog({ products: [], groups: [] });
      }
    })();
    return () => { active = false; };
  }, [state, catalog, api]);

  const update = (patch: Partial<PromotionForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (showErrors) setErrors(formErrors(next, { isNew, today }));
  };

  const save = async () => {
    const problems = formErrors(form, { isNew, today });
    setShowErrors(true);
    setErrors(problems);
    if (Object.keys(problems).length > 0) { setSaveError("Kiểm tra lại các ô được đánh dấu."); return; }
    setBusy(true);
    setSaveError(null);
    try {
      if (isNew) await api.post(BASE, toPayload(form));
      else await api.put(`${BASE}/${encodeURIComponent(state?.promotion?.id ?? "")}`, toPayload(form));
      onSaved(isNew);
    } catch (caught) {
      const fields = caught instanceof GatewayApiError ? serverFieldErrors(caught.details) : {};
      setErrors(fields);
      setSaveError(Object.keys(fields).length > 0 ? "Kiểm tra lại các ô được đánh dấu." : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" visible={state !== null} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng" onPress={onClose} />
          <Text style={local.title} accessibilityRole="header">{isNew ? "Tạo chương trình" : "Sửa chương trình"}</Text>
          <View style={local.spacer} />
        </View>
        <KeyboardAvoidingView style={local.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={local.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Section title="Thông tin">
              <LabeledInput label="Tên hiển thị cho người dùng" value={form.name} onChangeText={(name) => update({ name })} placeholder="VD: Giảm 10% đơn từ 200.000đ" error={errors.name} maxLength={120} />
            </Section>

            <Section title="Áp dụng cho">
              <Segmented<PromotionScope> label="Phạm vi" value={form.scope} options={SCOPE_OPTIONS} onChange={(scope) => update({ scope })} />
              {form.scope === "GROUP" ? (
                <ChipPicker
                  label="Nhóm hàng"
                  options={(catalog?.groups ?? []).map((group) => ({ value: group, label: group }))}
                  value={form.groups}
                  onChange={(groups) => update({ groups })}
                  loading={catalog === null}
                  error={errors.groups}
                />
              ) : null}
              {form.scope === "PRODUCTS" ? (
                <ProductPicker products={catalog?.products ?? []} loading={catalog === null} value={form.productIds} onChange={(productIds) => update({ productIds })} error={errors.productIds} />
              ) : null}
            </Section>

            <Section title="Mức giảm">
              <Segmented<PromotionType> label="Kiểu giảm" value={form.type} options={TYPE_OPTIONS} onChange={(type) => update({ type, maxDiscount: type === "AMOUNT" ? "" : form.maxDiscount })} />
              <View style={local.twoColumns}>
                <LabeledInput label={form.type === "PERCENT" ? "Phần trăm (%)" : "Số tiền (đ)"} value={form.value} onChangeText={(value) => update({ value })} keyboardType="number-pad" placeholder={form.type === "PERCENT" ? "10" : "20.000"} error={errors.value} style={local.flex} />
                {form.type === "PERCENT" ? (
                  <LabeledInput label="Giảm tối đa (đ)" value={form.maxDiscount} onChangeText={(maxDiscount) => update({ maxDiscount })} keyboardType="number-pad" placeholder="Không giới hạn" error={errors.maxDiscount} style={local.flex} />
                ) : null}
              </View>
            </Section>

            <Section title="Điều kiện">
              <View style={local.twoColumns}>
                <LabeledInput label="Đơn tối thiểu (đ)" value={form.minSubtotal} onChangeText={(minSubtotal) => update({ minSubtotal })} keyboardType="number-pad" placeholder="Không yêu cầu" error={errors.minSubtotal} style={local.flex} />
                <LabeledInput label="Số lần mỗi người" value={form.usageLimit} onChangeText={(usageLimit) => update({ usageLimit })} keyboardType="number-pad" placeholder="Không giới hạn" error={errors.usageLimit} style={local.flex} />
              </View>
              <Text style={local.hint}>Một lần được tính khi đơn giao thành công; đơn đang giao giữ chỗ, đơn hủy hoặc giao thất bại không tính.</Text>
            </Section>

            <Section title="Thời gian (giờ Việt Nam)">
              <DateField label="Ngày bắt đầu" value={form.startDate} onChange={(startDate) => update({ startDate })} minDate={isNew ? today : "2020-01-01"} suggestedDate={today} clearable={false} />
              {errors.startDate ? <Text style={local.fieldError} accessibilityRole="alert">{errors.startDate}</Text> : null}
              <DateField label="Ngày kết thúc" value={form.endDate} onChange={(endDate) => update({ endDate })} minDate={form.startDate || today} suggestedDate={form.startDate || today} clearable={false} />
              {errors.endDate ? <Text style={local.fieldError} accessibilityRole="alert">{errors.endDate}</Text> : null}
            </Section>

            <Section title="Trạng thái">
              <View style={local.switchRow}>
                <View style={local.flex}>
                  <Text style={local.name}>Đang bật</Text>
                  <Text style={local.meta}>Tắt để tạm dừng mà không xóa.</Text>
                </View>
                <Switch accessibilityLabel="Đang bật" value={form.isActive} onValueChange={(isActive) => update({ isActive })} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} />
              </View>
            </Section>
            {saveError ? <Text style={local.saveError} accessibilityRole="alert">{saveError}</Text> : null}
          </ScrollView>
          <View style={local.footer}>
            <Button variant="secondary" label="Hủy" onPress={onClose} style={local.flex} />
            <Button label={isNew ? "Tạo chương trình" : "Lưu"} icon={Check} busy={busy} onPress={() => void save()} style={local.flex} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={local.section}>
      <Text style={local.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

type LabeledInputProps = React.ComponentProps<typeof TextInput> & { label: string; error?: string };
function LabeledInput({ label, error, style, ...props }: LabeledInputProps): React.JSX.Element {
  return (
    <View style={[local.inputBlock, style]}>
      <Text style={local.inputLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[local.input, error ? local.inputError : null]} {...props} />
      {error ? <Text style={local.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

function ChipPicker({ label, options, value, onChange, loading, error }: { label: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (value: string[]) => void; loading: boolean; error?: string }): React.JSX.Element {
  const toggle = (item: string) => onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item]);
  return (
    <View style={local.inputBlock}>
      <Text style={local.inputLabel}>{label}</Text>
      {loading ? <Text style={local.meta}>Đang tải…</Text> : (
        <View style={local.chips}>
          {options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <Pressable key={option.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={option.label} onPress={() => toggle(option.value)} style={[local.chip, selected && local.chipSelected]}>
                {selected ? <AppIcon icon={Check} size="sm" color={colors.primaryText} /> : null}
                <Text style={[local.chipText, selected && local.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? <Text style={local.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

function ProductPicker({ products, loading, value, onChange, error }: { products: CatalogProduct[]; loading: boolean; value: string[]; onChange: (value: string[]) => void; error?: string }): React.JSX.Element {
  const [search, setSearch] = useState("");
  const key = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const shown = useMemo(() => {
    const term = key(search.trim());
    const selected = products.filter((product) => value.includes(product.id));
    const matches = products.filter((product) => !value.includes(product.id) && (!term || key(product.name).includes(term)));
    return [...selected, ...matches].slice(0, 60);
  }, [products, search, value]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  return (
    <View style={local.inputBlock}>
      <Text style={local.inputLabel}>Sản phẩm ({value.length} đã chọn)</Text>
      <View style={[local.input, local.searchRow]}>
        <AppIcon icon={Search} size="sm" color={colors.muted} />
        <TextInput accessibilityLabel="Tìm sản phẩm" value={search} onChangeText={setSearch} placeholder="Tìm sản phẩm" placeholderTextColor={colors.muted} style={local.searchInput} />
      </View>
      {loading ? <Text style={local.meta}>Đang tải…</Text> : (
        <ScrollView style={local.productList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {shown.map((product) => {
            const selected = value.includes(product.id);
            return (
              <Pressable key={product.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${product.name}, ${product.group}`} onPress={() => toggle(product.id)} style={({ pressed }) => [local.productRow, pressed && local.pressed]}>
                <View style={[local.checkbox, selected && local.checkboxOn]}>{selected ? <AppIcon icon={Check} size="sm" color={colors.primaryText} /> : null}</View>
                <Text style={[local.flex, local.productName]} numberOfLines={1}>{product.name}</Text>
                <Text style={local.meta} numberOfLines={1}>{product.group}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {error ? <Text style={local.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const local = StyleSheet.create({
  content: { paddingBottom: spacing.xl, paddingTop: spacing.md },
  headerBlock: { gap: spacing.sm, marginBottom: spacing.md },
  heading: { ...textStyles.subheading },
  notice: { ...textStyles.bodySmall, backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, padding: spacing.md },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardTop: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  flex: { flex: 1, minWidth: 0 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  name: { ...textStyles.label },
  value: { ...textStyles.labelSmall, color: colors.success },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  actions: { flexDirection: "row", gap: spacing.sm },
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  title: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  formContent: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionTitle: { ...textStyles.label },
  twoColumns: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  inputBlock: { gap: spacing.xs, minWidth: 140 },
  inputLabel: { ...textStyles.bodySmall, color: colors.muted },
  input: { ...textStyles.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  inputError: { borderColor: colors.danger },
  fieldError: { ...textStyles.caption, color: colors.danger },
  hint: { ...textStyles.caption, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { alignItems: "center", borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...textStyles.bodySmall, color: colors.text },
  chipTextSelected: { color: colors.primaryText, fontWeight: "700" },
  searchRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  searchInput: { ...textStyles.body, flex: 1, minHeight: touchTarget - 2, padding: 0 },
  productList: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, maxHeight: 320 },
  productRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.md },
  productName: { ...textStyles.body },
  checkbox: { alignItems: "center", borderColor: colors.border, borderRadius: 6, borderWidth: 2, height: 22, justifyContent: "center", width: 22 },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.primarySoft },
  switchRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  saveError: { ...textStyles.bodySmall, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, color: colors.danger, padding: spacing.md },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
});
