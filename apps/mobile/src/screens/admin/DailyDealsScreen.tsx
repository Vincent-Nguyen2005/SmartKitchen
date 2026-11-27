import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Check, RefreshCw, Repeat, Search, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { SegmentTabs } from "../../components/SegmentTabs";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage } from "../notifications/gatewayApi";
import { Button, colors, ScreenState, styles, useLayout } from "../notifications/ui";
import type { AutoSaveState } from "../../services/autoSave";
import { createSettingsAutoSave, DEAL_TABS, dealPriceParts, dealTabMemory, formOf, saveStatusText, settingsPayload, statusNote, swapNotice, switchLabel, todayHeader, type DailyDealsResponse, type DealTab, type SettingsField, type SettingsForm } from "./dailyDeals";

const BASE = "/api/admin/daily-deals";

/**
 * Quản trị › "Khuyến mãi" (Giảm giá tự động): every day N catalog products get a discount automatically (shown to users
 * exactly like a normal discount). Two segment tabs (choice kept for the session):
 * - "Hôm nay" (default): "<Thứ>, dd/MM/yyyy · Giảm a–b%", today's list (% pill, name, "giá gốc → giá giảm / đơn vị",
 *   icon button "Đổi nguyên liệu") and "Chọn lại hôm nay" (confirm).
 * - "Cài đặt": auto-saved (no save button): the switch and exclusions at once, numbers ~600 ms after typing stops and
 *   on blur (invalid values are not sent; the error shows under the field); "Đang lưu… / Đã lưu" at the top.
 * admin-service checks the ADMIN role and writes the audit log.
 */
export default function DailyDealsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [data, setData] = useState<DailyDealsResponse | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SettingsField, string>>>({});
  const [saveState, setSaveState] = useState<AutoSaveState>({ status: "idle", error: null, field: null });
  const formRef = useRef<SettingsForm | null>(null);
  const saverRef = useRef<ReturnType<typeof createSettingsAutoSave> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTabState] = useState<DealTab>(dealTabMemory.get());
  const setTab = (next: DealTab) => { if (next !== "settings") void saverRef.current?.flush(); setTabState(dealTabMemory.set(next)); setNotice(null); };
  const { confirm, dialog } = useConfirm();

  /** Today's list after a settings save; the form being typed in is left alone. */
  const refreshData = useCallback(async () => {
    try { setData(await api.get<DailyDealsResponse>(BASE)); } catch { /* the next load shows it */ }
  }, [api]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      await saverRef.current?.flush();
      const next = await api.get<DailyDealsResponse>(BASE);
      setData(next);
      const nextForm = formOf(next.settings);
      formRef.current = nextForm;
      setForm(nextForm);
      setFieldErrors({});
      saverRef.current = createSettingsAutoSave({
        initial: settingsPayload(nextForm),
        save: async (settings) => { await api.put(`${BASE}/settings`, settings); void refreshData(); },
        onState: setSaveState,
      });
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  // Leaving the screen saves anything still pending.
  useEffect(() => () => { void saverRef.current?.flush(); }, []);

  /** "type": numbers while typing (debounced); "commit": switch, exclusions and blur (at once). */
  const update = (patch: Partial<SettingsForm>, mode: "type" | "commit") => {
    if (!formRef.current || !saverRef.current) return;
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    setNotice(null);
    setFieldErrors(mode === "type" ? saverRef.current.type(next) : saverRef.current.commit(next));
  };
  const commitCurrent = () => update({}, "commit");

  const swap = async (productId: string) => {
    const before = data?.deals ?? [];
    setBusyId(productId);
    try {
      const next = await api.post<{ deals: DailyDealsResponse["deals"] }>(`${BASE}/today/${encodeURIComponent(productId)}/swap`);
      setData((current) => (current ? { ...current, deals: next.deals } : current));
      setNotice(swapNotice(before, next.deals));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  const reroll = async () => {
    const ok = await confirm({ title: "Chọn lại danh sách hôm nay?", message: "Toàn bộ sản phẩm giảm giá hôm nay sẽ được chọn lại.", confirmLabel: "Chọn lại" });
    if (!ok) return;
    setBusyId("reroll");
    try {
      const next = await api.post<{ deals: DailyDealsResponse["deals"] }>(`${BASE}/today/reroll`);
      setData((current) => (current ? { ...current, deals: next.deals } : current));
      setNotice("Đã chọn lại danh sách hôm nay.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  if (!data || !form) {
    return <View style={styles.screen}><ScreenState loading={!error} error={error} onRetry={() => void load()} /></View>;
  }
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[local.content, { paddingHorizontal: gutter }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}>
        <SegmentTabs options={DEAL_TABS} value={tab} onChange={setTab} />
        {notice ? <Text style={local.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}

        {tab === "settings" ? (
          <View style={local.section}>
            {saveStatusText(saveState) ? <Text style={local.saveStatus} accessibilityLiveRegion="polite">{saveStatusText(saveState)}</Text> : null}
            {saveState.status === "error" && saveState.error ? <Text style={styles.errorText} accessibilityRole="alert">{saveState.error}</Text> : null}
            <View style={local.switchRow}>
              <Text style={[local.label, local.flex]}>{switchLabel(form.enabled)}</Text>
              <Switch accessibilityLabel="Giảm giá tự động" accessibilityHint={switchLabel(form.enabled)} value={form.enabled} onValueChange={(enabled) => update({ enabled }, "commit")} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} />
            </View>
            <View style={local.columns}>
              <NumberInput label="Số sản phẩm mỗi ngày" value={form.dealsPerDay} onChange={(dealsPerDay) => update({ dealsPerDay }, "type")} onBlur={commitCurrent} error={fieldErrors.dealsPerDay} />
              <NumberInput label="Giảm thấp nhất (%)" value={form.minPercent} onChange={(minPercent) => update({ minPercent }, "type")} onBlur={commitCurrent} error={fieldErrors.minPercent} />
              <NumberInput label="Giảm cao nhất (%)" value={form.maxPercent} onChange={(maxPercent) => update({ maxPercent }, "type")} onBlur={commitCurrent} error={fieldErrors.maxPercent} />
            </View>
            <ExcludedPicker products={data.products} value={form.excludedProductIds} onChange={(excludedProductIds) => update({ excludedProductIds }, "commit")} />
          </View>
        ) : (
          <View style={local.section}>
            <Text style={local.sectionTitle} accessibilityRole="header">{todayHeader(data.day, data.settings)}</Text>
            {data.deals.length === 0 ? (
              <Text style={local.meta}>{data.settings.enabled ? "Không có sản phẩm nào đủ điều kiện hôm nay." : "Giảm giá tự động đang tắt."}</Text>
            ) : data.deals.map((deal, index) => {
              const note = statusNote(deal.status);
              const price = dealPriceParts(deal);
              return (
                <View key={deal.productId} style={[local.dealRow, index > 0 && local.divider]}>
                  <View style={[local.percent, note && local.percentMuted]}><Text style={[local.percentText, note && local.percentTextMuted]}>−{deal.percent}%</Text></View>
                  <View style={local.flex}>
                    <Text style={local.label} numberOfLines={1} ellipsizeMode="tail">{deal.name}</Text>
                    {price ? (
                      <Text style={local.meta} numberOfLines={1}>
                        <Text style={local.struck}>{price.original}</Text> → <Text style={local.discounted}>{price.discounted}</Text>
                      </Text>
                    ) : <Text style={local.meta}>Chưa có giá</Text>}
                    {note ? <Text style={local.warning}>{note}</Text> : null}
                  </View>
                  {busyId === deal.productId ? (
                    <View style={local.swapBusy}><ActivityIndicator color={colors.primary} accessibilityLabel="Đang đổi nguyên liệu" /></View>
                  ) : (
                    <IconButton icon={Repeat} color={colors.primary} accessibilityLabel="Đổi nguyên liệu" accessibilityHint={`Đổi ${deal.name} sang nguyên liệu khác`} disabled={busyId !== null} onPress={() => void swap(deal.productId)} />
                  )}
                </View>
              );
            })}
            <Button variant="secondary" icon={RefreshCw} label="Chọn lại hôm nay" busy={busyId === "reroll"} disabled={busyId !== null || !data.settings.enabled} onPress={() => void reroll()} />
          </View>
        )}
      </ScrollView>
      {dialog}
    </View>
  );
}

function NumberInput({ label, value, onChange, onBlur, error }: { label: string; value: string; onChange: (value: string) => void; onBlur: () => void; error?: string }): React.JSX.Element {
  return (
    <View style={local.inputBlock}>
      <Text style={local.inputLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="number-pad" maxLength={3} style={[local.input, error ? local.inputError : null]} />
      {error ? <Text style={local.fieldError} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

function ExcludedPicker({ products, value, onChange }: { products: DailyDealsResponse["products"]; value: string[]; onChange: (value: string[]) => void }): React.JSX.Element {
  const [search, setSearch] = useState("");
  const key = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const matches = useMemo(() => {
    const term = key(search.trim());
    return term ? products.filter((product) => !value.includes(product.id) && key(product.name).includes(term)).slice(0, 8) : [];
  }, [products, search, value]);
  return (
    <View style={local.inputBlock}>
      <Text style={local.inputLabel}>Không bao giờ tự giảm giá ({value.length})</Text>
      {value.length > 0 ? (
        <View style={local.chips}>
          {value.map((id) => (
            <View key={id} style={local.chip}>
              <Text style={local.chipText} numberOfLines={1}>{byId.get(id)?.name ?? "(đã xóa)"}</Text>
              <IconButton icon={X} size="sm" accessibilityLabel={`Bỏ loại trừ ${byId.get(id)?.name ?? ""}`} onPress={() => onChange(value.filter((entry) => entry !== id))} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={[local.input, local.searchRow]}>
        <AppIcon icon={Search} size="sm" color={colors.muted} />
        <TextInput accessibilityLabel="Tìm sản phẩm để loại trừ" value={search} onChangeText={setSearch} placeholder="Tìm sản phẩm để loại trừ" placeholderTextColor={colors.muted} style={local.searchInput} />
      </View>
      {matches.map((product) => (
        <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Loại trừ ${product.name}`} onPress={() => { onChange([...value, product.id]); setSearch(""); }} style={({ pressed }) => [local.matchRow, pressed && local.pressed]}>
          <AppIcon icon={Check} size="sm" color={colors.primary} />
          <Text style={[local.flex, local.label]} numberOfLines={1}>{product.name}</Text>
          <Text style={local.meta}>{product.group}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl, paddingTop: spacing.md },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  saveStatus: { ...textStyles.caption, color: colors.muted, textAlign: "right" },
  notice: { ...textStyles.bodySmall, backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, padding: spacing.md },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionTitle: { ...textStyles.label },
  switchRow: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  label: { ...textStyles.label },
  columns: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  inputBlock: { flexGrow: 1, gap: spacing.xs, minWidth: 130 },
  inputLabel: { ...textStyles.bodySmall, color: colors.muted },
  input: { ...textStyles.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  inputError: { borderColor: colors.danger },
  fieldError: { ...textStyles.caption, color: colors.danger },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", maxWidth: "100%", paddingLeft: spacing.md },
  chipText: { ...textStyles.bodySmall, flexShrink: 1 },
  searchRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  searchInput: { ...textStyles.body, flex: 1, minHeight: touchTarget - 2, padding: 0 },
  matchRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  pressed: { backgroundColor: colors.primarySoft },
  dealRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  percent: { alignItems: "center", backgroundColor: colors.danger, borderRadius: radius.pill, minWidth: 52, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  percentMuted: { backgroundColor: colors.border },
  percentText: { ...textStyles.labelSmall, color: colors.surface },
  percentTextMuted: { color: colors.muted },
  warning: { ...textStyles.caption, color: colors.warning },
  struck: { textDecorationLine: "line-through" },
  discounted: { color: colors.text, fontWeight: "600" },
  swapBusy: { alignItems: "center", justifyContent: "center", minHeight: touchTarget, minWidth: touchTarget },
});
