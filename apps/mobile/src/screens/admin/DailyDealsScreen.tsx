import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Check, RefreshCw, Repeat, Save, Search, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget } from "../../theme";
import { useConfirm } from "../../components/ConfirmDialog";
import { formatVnd } from "../../services/format";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage } from "../notifications/gatewayApi";
import { Button, colors, ScreenState, styles, useLayout } from "../notifications/ui";
import { dayLabel, formOf, settingsErrors, settingsPayload, settingsSummary, sourceLabel, statusNote, type DailyDealsResponse, type SettingsField, type SettingsForm } from "./dailyDeals";

const BASE = "/api/admin/daily-deals";

/**
 * Quản trị › "Giảm giá tự động": every day N catalog products get a discount automatically (shown to users exactly
 * like a normal discount). Settings (on / off, products per day, % range, excluded products) and today's list with
 * "Đổi món" per row and "Chọn lại hôm nay". admin-service checks the ADMIN role and writes the audit log.
 */
export default function DailyDealsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [data, setData] = useState<DailyDealsResponse | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const next = await api.get<DailyDealsResponse>(BASE);
      setData(next);
      setForm(formOf(next.settings));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const errors = form && showErrors ? settingsErrors(form) : {};
  const update = (patch: Partial<SettingsForm>) => { setNotice(null); setForm((current) => (current ? { ...current, ...patch } : current)); };

  const save = async () => {
    if (!form) return;
    setShowErrors(true);
    if (Object.keys(settingsErrors(form)).length > 0) return;
    setSaving(true);
    try {
      await api.put(`${BASE}/settings`, settingsPayload(form));
      setNotice("Đã lưu. Thay đổi áp dụng từ lần chọn tiếp theo (ngày mai hoặc khi bấm Chọn lại hôm nay).");
      setShowErrors(false);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const swap = async (productId: string, name: string) => {
    setBusyId(productId);
    try {
      const next = await api.post<{ deals: DailyDealsResponse["deals"] }>(`${BASE}/today/${encodeURIComponent(productId)}/swap`);
      setData((current) => (current ? { ...current, deals: next.deals } : current));
      setNotice(`Đã đổi ${name} sang sản phẩm khác.`);
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
        <Text style={local.heading} accessibilityRole="header">Giảm giá tự động</Text>
        <Text style={local.meta}>Mỗi ngày hệ thống tự giảm giá một số nguyên liệu. Người dùng thấy như giảm giá bình thường.</Text>
        {notice ? <Text style={local.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        {error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}

        <View style={local.section}>
          <Text style={local.sectionTitle} accessibilityRole="header">Cài đặt</Text>
          <View style={local.switchRow}>
            <View style={local.flex}>
              <Text style={local.label}>Đang bật</Text>
              <Text style={local.meta}>Tắt để dừng ngay (sản phẩm hôm nay trở lại giá thường).</Text>
            </View>
            <Switch accessibilityLabel="Bật giảm giá tự động" value={form.enabled} onValueChange={(enabled) => update({ enabled })} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.surface} />
          </View>
          <View style={local.columns}>
            <NumberInput label="Số sản phẩm mỗi ngày" value={form.dealsPerDay} onChange={(dealsPerDay) => update({ dealsPerDay })} error={errors.dealsPerDay} />
            <NumberInput label="Giảm thấp nhất (%)" value={form.minPercent} onChange={(minPercent) => update({ minPercent })} error={errors.minPercent} />
            <NumberInput label="Giảm cao nhất (%)" value={form.maxPercent} onChange={(maxPercent) => update({ maxPercent })} error={errors.maxPercent} />
          </View>
          <ExcludedPicker products={data.products} value={form.excludedProductIds} onChange={(excludedProductIds) => update({ excludedProductIds })} />
          <Button label="Lưu cài đặt" icon={Save} busy={saving} onPress={() => void save()} />
        </View>

        <View style={local.section}>
          <View style={local.sectionHeader}>
            <View style={local.flex}>
              <Text style={local.sectionTitle} accessibilityRole="header">Hôm nay · {dayLabel(data.day)}</Text>
              <Text style={local.meta}>{settingsSummary(data.settings)}</Text>
            </View>
          </View>
          {data.deals.length === 0 ? (
            <Text style={local.meta}>{data.settings.enabled ? "Không có sản phẩm nào đủ điều kiện hôm nay." : "Giảm giá tự động đang tắt."}</Text>
          ) : data.deals.map((deal, index) => {
            const note = statusNote(deal.status);
            return (
              <View key={deal.productId} style={[local.dealRow, index > 0 && local.divider]}>
                <View style={[local.percent, note && local.percentMuted]}><Text style={[local.percentText, note && local.percentTextMuted]}>−{deal.percent}%</Text></View>
                <View style={local.flex}>
                  <Text style={local.label} numberOfLines={1}>{deal.name}</Text>
                  <Text style={local.meta} numberOfLines={1}>{[deal.group, deal.price !== null ? formatVnd(deal.price) : null, sourceLabel(deal.source)].filter(Boolean).join(" · ")}</Text>
                  {note ? <Text style={local.warning}>{note}</Text> : null}
                </View>
                <Button variant="secondary" icon={Repeat} label="Đổi món" busy={busyId === deal.productId} disabled={busyId !== null} onPress={() => void swap(deal.productId, deal.name)} accessibilityLabel={`Đổi ${deal.name} sang sản phẩm khác`} />
              </View>
            );
          })}
          <Button variant="secondary" icon={RefreshCw} label="Chọn lại hôm nay" busy={busyId === "reroll"} disabled={busyId !== null || !data.settings.enabled} onPress={() => void reroll()} />
        </View>
      </ScrollView>
      {dialog}
    </View>
  );
}

function NumberInput({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }): React.JSX.Element {
  return (
    <View style={local.inputBlock}>
      <Text style={local.inputLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType="number-pad" maxLength={3} style={[local.input, error ? local.inputError : null]} />
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
  heading: { ...textStyles.subheading },
  meta: { ...textStyles.bodySmall, color: colors.muted },
  notice: { ...textStyles.bodySmall, backgroundColor: colors.successSoft, borderRadius: radius.sm, color: colors.success, padding: spacing.md },
  section: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
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
});
