import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react-native";
import { AppIcon, IconButton, radius, spacing, textStyles, touchTarget, type LucideIcon } from "../../theme";
import { SegmentTabs } from "../../components/SegmentTabs";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { errorMessage, query } from "../notifications/gatewayApi";
import { colors } from "../notifications/ui";
import { vnd, vndSpoken } from "../spending/spending";
import { BarChart } from "./charts";
import { canGoForward, chartBars, comparisonText, PERIOD_OPTIONS, periodTitle, productQuantity, shipperTitle, type RevenuePeriod, type RevenueReport } from "./revenue";

type Props = { visible: boolean; onClose: () => void };

/** Short axis numbers for the chart ("1,2tr", "350k"). */
const shortVnd = (value: number): string => (value >= 1_000_000 ? `${String(Math.round(value / 100_000) / 10).replace(".", ",")}tr` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value));

/**
 * Quản trị › "Doanh thu" (full-screen page from the bottom bar), polished like Chi tiêu: today / 7 ngày / tháng này
 * with ‹ › to earlier periods (Vietnam days, delivered orders only). Revenue with the comparison to the period before,
 * orders and the average order, discounts (per item incl. daily deals / checkout promotions), a bar per day, the top 5
 * products, catalog groups and COD collected per shipper.
 */
export default function AdminRevenueScreen({ visible, onClose }: Props): React.JSX.Element {
  const { api } = useGatewayApi();
  const [period, setPeriod] = useState<RevenuePeriod>("today");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true);
    setError(null);
    try {
      const result = (await api.get<{ data: RevenueReport }>(`/api/shopping-list/admin/revenue${query({ period, offset })}`)).data;
      if (id === requestId.current) setReport(result);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [api, period, offset]);

  useEffect(() => { if (visible) { setReport(null); void load(); } }, [visible, load]);
  useEffect(() => { if (!visible) { setPeriod("today"); setOffset(0); } }, [visible]);

  const shown = report && report.period.kind === period && report.period.offset === offset ? report : null;
  const comparison = shown ? comparisonText(shown.changePercent) : null;
  const toneColor = comparison?.tone === "up" ? colors.success : comparison?.tone === "down" ? colors.danger : colors.muted;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={local.screen} edges={["top", "bottom", "left", "right"]}>
        <View style={local.topBar}>
          <IconButton icon={X} accessibilityLabel="Đóng Doanh thu" onPress={onClose} />
          <Text style={local.topTitle} accessibilityRole="header">Doanh thu</Text>
          <View style={local.spacer} />
        </View>
        <ScrollView contentContainerStyle={local.content} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />}>
          <SegmentTabs options={PERIOD_OPTIONS} value={period} onChange={(value) => { setPeriod(value); setOffset(0); }} />
          <View style={local.switcher}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Kỳ trước" color={colors.primary} onPress={() => setOffset((value) => value - 1)} />
            <Text style={local.switcherTitle} accessibilityRole="header">{shown ? periodTitle(shown.period) : " "}</Text>
            <IconButton icon={ChevronRight} accessibilityLabel={canGoForward(offset) ? "Kỳ sau" : "Không có kỳ sau"} color={colors.primary} disabled={!canGoForward(offset)} onPress={() => setOffset((value) => Math.min(0, value + 1))} />
          </View>

          {error && !shown ? (
            <StateView icon={RefreshCw} text={error} action="Thử lại" onAction={() => void load()} />
          ) : !shown ? (
            <View style={{ gap: spacing.md }}>{[120, 80, 200].map((height) => <View key={height} style={[local.card, local.skeleton, { height }]} />)}</View>
          ) : (
            <>
              <View style={local.card} accessible accessibilityLabel={`Doanh thu ${vndSpoken(shown.total)}. ${comparison?.text ?? ""}`}>
                <Text style={local.caption}>Doanh thu (đơn đã giao)</Text>
                <Text style={local.big}>{vnd(shown.total)}</Text>
                {comparison ? <Text style={[local.comparison, { color: toneColor }]}>{comparison.text}</Text> : null}
              </View>
              <View style={local.statRow}>
                <Stat label="Đơn hàng" value={String(shown.orders)} spoken={`${shown.orders} đơn`} />
                <Stat label="Trung bình / đơn" value={vnd(shown.average)} spoken={vndSpoken(shown.average)} />
              </View>
              <View style={local.card}>
                <Text style={local.sectionTitle} accessibilityRole="header">Đã giảm cho khách</Text>
                <AmountRow label="Giảm theo món (gồm giảm giá tự động)" amount={shown.discounts.items} />
                <AmountRow label="Khuyến mãi khi đặt hàng" amount={shown.discounts.promotions} />
              </View>
              {shown.days.length > 1 ? (
                <View style={local.card}>
                  <Text style={local.sectionTitle} accessibilityRole="header">Doanh thu theo ngày</Text>
                  <BarChart
                    data={chartBars(shown.days, shown.period.kind)}
                    accessibilityLabel={`Doanh thu theo ngày: ${shown.days.filter((day) => day.total > 0).map((day) => `${day.day.slice(8, 10)}/${day.day.slice(5, 7)} ${vndSpoken(day.total)}`).join(", ") || "chưa có"}`}
                    formatValue={shortVnd}
                    height={180}
                  />
                </View>
              ) : null}
              <ListCard title="Sản phẩm bán chạy" empty="Chưa có sản phẩm nào.">
                {shown.topProducts.map((product, index) => (
                  <AmountRow key={`${product.name}-${index}`} label={`${index + 1}. ${product.name}`} detail={productQuantity(product)} amount={product.revenue} />
                ))}
              </ListCard>
              <ListCard title="Theo nhóm hàng" empty="Chưa có dữ liệu.">
                {shown.groups.map((group) => <AmountRow key={group.name} label={group.name} detail={`${group.percent}%`} amount={group.amount} />)}
              </ListCard>
              <ListCard title="Tiền thu theo người giao (COD)" empty="Chưa có đơn đã giao.">
                {shown.shippers.map((shipper, index) => <AmountRow key={`${shipper.name ?? "direct"}-${index}`} label={shipperTitle(shipper)} detail={`${shipper.orders} đơn`} amount={shipper.amount} />)}
              </ListCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Stat({ label, value, spoken }: { label: string; value: string; spoken: string }): React.JSX.Element {
  return (
    <View style={[local.card, local.stat]} accessible accessibilityLabel={`${label}: ${spoken}`}>
      <Text style={local.caption}>{label}</Text>
      <Text style={local.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function AmountRow({ label, detail, amount }: { label: string; detail?: string; amount: number }): React.JSX.Element {
  return (
    <View style={local.row} accessible accessibilityLabel={`${label}${detail ? `, ${detail}` : ""}: ${vndSpoken(amount)}`}>
      <View style={local.flex}>
        <Text style={local.rowLabel} numberOfLines={2}>{label}</Text>
        {detail ? <Text style={local.caption}>{detail}</Text> : null}
      </View>
      <Text style={local.rowValue}>{vnd(amount)}</Text>
    </View>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }): React.JSX.Element {
  return (
    <View style={local.card}>
      <Text style={local.sectionTitle} accessibilityRole="header">{title}</Text>
      {children.length > 0 ? children : <Text style={local.caption}>{empty}</Text>}
    </View>
  );
}

function StateView({ icon, text, action, onAction }: { icon: LucideIcon; text: string; action: string; onAction: () => void }): React.JSX.Element {
  return (
    <View style={local.state}>
      <View style={local.stateIcon}><AppIcon icon={icon} size="lg" color={colors.primary} /></View>
      <Text style={local.stateText}>{text}</Text>
      <Pressable accessibilityRole="button" onPress={onAction} style={local.stateButton}><Text style={local.stateButtonText}>{action}</Text></Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topBar: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  topTitle: { ...textStyles.subheading, flex: 1, textAlign: "center" },
  spacer: { width: touchTarget },
  content: { alignSelf: "center", gap: spacing.md, maxWidth: 720, padding: spacing.lg, width: "100%" },
  switcher: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: -spacing.sm },
  switcherTitle: { ...textStyles.label, flex: 1, textAlign: "center" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  skeleton: { backgroundColor: colors.border, opacity: 0.5 },
  caption: { ...textStyles.caption, color: colors.muted },
  big: { ...textStyles.pageTitle },
  comparison: { ...textStyles.labelSmall },
  statRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, minWidth: 0 },
  statValue: { ...textStyles.subheading },
  sectionTitle: { ...textStyles.label },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 40 },
  flex: { flex: 1, minWidth: 0 },
  rowLabel: { ...textStyles.body },
  rowValue: { ...textStyles.label, textAlign: "right" },
  state: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl * 2 },
  stateIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 32, height: 64, justifyContent: "center", width: 64 },
  stateText: { ...textStyles.body, color: colors.muted, textAlign: "center" },
  stateButton: { borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.lg },
  stateButtonText: { ...textStyles.label, color: colors.primary },
});
