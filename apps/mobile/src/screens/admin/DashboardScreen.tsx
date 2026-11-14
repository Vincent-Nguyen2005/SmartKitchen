import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Activity, ChartColumn, ChartLine, CheckCheck, CircleCheck, CircleQuestionMark, CircleX, Flag, Server, TriangleExclamationPoint,
} from "lucide-react-native";
import { errorMessage, query } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, MultiDropdown, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";
import { AppIcon, chartColors, spacing, typography, type LucideIcon } from "../../theme";
import { BarChart, formatNumber, LineChart } from "./charts";

type Window = "24h" | "7d";
type Status = "UP" | "DOWN" | "DEGRADED";
type Overall = Status | "UNKNOWN";
type StatusResponse = { overall: Overall; checkedAt: string | null; services: { serviceName: string; status: Status | null }[] };
type SummaryResponse = { window: Window; services: { serviceName: string; samples: number; uptimePercent: number | null }[] };
type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
type Category = "ABUSE" | "SPAM" | "BUG" | "OTHER";
type StatsResponse = { total: number; byStatus: Record<ReportStatus, number>; byCategory: Record<Category, number>; resolvedInWindow?: number | null };
type Bucket = { start: string; samples: number; uptimePercent: number | null; avgResponseTimeMs: number | null; p95ResponseTimeMs: number | null };
type TimeseriesResponse = { service: string | null; window: Window; bucketMinutes: number; buckets: Bucket[] };
type Section<T> = { data: T | null; error: string | null };

const empty = <T,>(): Section<T> => ({ data: null, error: null });
const windowText: Record<Window, string> = { "24h": "24 giờ", "7d": "7 ngày" };
const statusText: Record<ReportStatus, string> = { OPEN: "Mới", IN_REVIEW: "Đang xem xét", RESOLVED: "Đã xử lý", REJECTED: "Từ chối" };
const categoryText: Record<Category, string> = { ABUSE: "Lạm dụng", SPAM: "Spam", BUG: "Lỗi", OTHER: "Khác" };
const reportStatusColor: Record<ReportStatus, string> = { OPEN: colors.primary, IN_REVIEW: colors.warning, RESOLVED: colors.success, REJECTED: colors.danger };
const overallText: Record<Overall, string> = { UP: "Hoạt động", DEGRADED: "Chậm", DOWN: "Ngừng", UNKNOWN: "Chưa có dữ liệu" };
const overallColor: Record<Overall, string> = { UP: colors.success, DEGRADED: colors.warning, DOWN: colors.danger, UNKNOWN: colors.muted };
const overallIcon: Record<Overall, LucideIcon> = { UP: CircleCheck, DEGRADED: TriangleExclamationPoint, DOWN: CircleX, UNKNOWN: CircleQuestionMark };
const shortName = (serviceName: string) => serviceName.replace(/-service$/, "");
const uptimeColor = (value: number | null) => (value === null ? colors.border : value >= 99 ? colors.success : value >= 95 ? colors.warning : colors.danger);
const pad = (value: number) => String(value).padStart(2, "0");
const bucketLabel = (iso: string, window: Window) => {
  const date = new Date(iso);
  return window === "24h" ? `${pad(date.getHours())}:00` : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}h`;
};
const range = (values: (number | null)[]) => {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length ? { min: Math.min(...known), max: Math.max(...known), last: known[known.length - 1], count: known.length } : null;
};

/** Admin overview: KPIs and charts for reports and service health (owner: Huy, #58/#59). */
export default function DashboardScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const kpiGrid = useGridCell(isWide ? 4 : 2);
  const chartGrid = useGridCell(isWide ? 2 : 1);
  const [window, setWindow] = useState<Window>("24h");
  // Empty = all monitored services; the time charts aggregate the selected services.
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const servicesParam = selectedServices.join(",");
  const [status, setStatus] = useState<Section<StatusResponse>>(empty);
  const [summary, setSummary] = useState<Section<SummaryResponse>>(empty);
  const [stats, setStats] = useState<Section<StatsResponse>>(empty);
  const [series, setSeries] = useState<Section<TimeseriesResponse>>(empty);
  const [loading, setLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const overviewRequest = useRef(0);
  const seriesRequest = useRef(0);

  const loadOverview = useCallback(async () => {
    const id = ++overviewRequest.current;
    const [statusResult, summaryResult, statsResult] = await Promise.allSettled([
      api.get<StatusResponse>("/api/admin/health-monitor/status"),
      api.get<SummaryResponse>(`/api/admin/health-monitor/summary${query({ window })}`),
      api.get<StatsResponse>(`/api/admin/reports/stats${query({ window })}`),
    ]);
    if (id !== overviewRequest.current) return; // a newer request (window change / refresh) replaced this one
    const toSection = <T,>(result: PromiseSettledResult<T>): Section<T> =>
      result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };
    setStatus(toSection(statusResult));
    setSummary(toSection(summaryResult));
    setStats(toSection(statsResult));
  }, [api, window]);

  const loadSeries = useCallback(async () => {
    const id = ++seriesRequest.current;
    setSeriesLoading(true);
    try {
      const result = await api.get<TimeseriesResponse>(`/api/admin/health-monitor/timeseries${query({ window, service: servicesParam || undefined })}`);
      if (id === seriesRequest.current) setSeries({ data: result, error: null });
    } catch (caught) {
      if (id === seriesRequest.current) setSeries({ data: null, error: errorMessage(caught) });
    } finally {
      if (id === seriesRequest.current) setSeriesLoading(false);
    }
  }, [api, servicesParam, window]);

  useEffect(() => { setLoading(true); void loadOverview().finally(() => setLoading(false)); }, [loadOverview]);
  useEffect(() => { void loadSeries(); }, [loadSeries]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadSeries()]);
    setRefreshing(false);
  };
  const retryAll = () => { setLoading(true); void Promise.all([loadOverview(), loadSeries()]).finally(() => setLoading(false)); };

  const nothingLoaded = !status.data && !summary.data && !stats.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && status.error && summary.error && stats.error) return <ScreenState error={status.error} onRetry={retryAll} />;

  const services = status.data?.services ?? [];
  const counts = { UP: 0, DEGRADED: 0, DOWN: 0, NONE: 0 };
  for (const item of services) counts[item.status ?? "NONE"] += 1;
  const overall: Overall = status.data?.overall ?? "UNKNOWN";
  const serviceLabel = selectedServices.length === 0 ? "tất cả dịch vụ"
    : selectedServices.length === 1 ? shortName(selectedServices[0])
      : `${selectedServices.length} dịch vụ (${selectedServices.map(shortName).join(", ")})`;

  // Chart data and spoken summaries.
  const reportStatuses = (Object.keys(statusText) as ReportStatus[]).map((key) => ({ label: statusText[key], value: stats.data?.byStatus[key] ?? 0, color: reportStatusColor[key] }));
  const reportCategories = (Object.keys(categoryText) as Category[]).map((key, index) => ({ label: categoryText[key], value: stats.data?.byCategory[key] ?? 0, color: chartColors.series[index] }));
  const buckets = series.data?.buckets ?? [];
  const xLabels = buckets.map((bucket) => bucketLabel(bucket.start, window));
  const avg = buckets.map((bucket) => bucket.avgResponseTimeMs);
  const p95 = buckets.map((bucket) => bucket.p95ResponseTimeMs);
  const uptime = buckets.map((bucket) => bucket.uptimePercent);
  const avgRange = range(avg); const p95Range = range(p95); const uptimeRange = range(uptime);
  const seriesEmpty = buckets.every((bucket) => bucket.samples === 0);
  // Zoom the uptime axis so small dips stay visible; the axis labels show the range.
  const uptimeAxisMin = !uptimeRange ? 0 : uptimeRange.min >= 95 ? 90 : uptimeRange.min >= 75 ? 70 : uptimeRange.min >= 50 ? 50 : 0;
  const perService = [...(summary.data?.services ?? [])]
    .sort((a, b) => (a.uptimePercent ?? 101) - (b.uptimePercent ?? 101))
    .map((item) => ({ label: shortName(item.serviceName), value: item.uptimePercent, color: uptimeColor(item.uptimePercent) }));
  const perServiceKnown = perService.filter((item) => item.value !== null);

  const kpis: { label: string; value: string; detail: string; icon: LucideIcon; color: string; error: string | null }[] = [
    { label: "Tổng thể", value: overallText[overall], detail: status.data?.checkedAt ? `Kiểm tra lúc ${new Date(status.data.checkedAt).toLocaleTimeString("vi-VN")}` : "Chưa có lần kiểm tra", icon: overallIcon[overall], color: overallColor[overall], error: status.error },
    { label: "Dịch vụ", value: `${counts.UP}/${services.length}`, detail: `hoạt động · Chậm ${counts.DEGRADED} · Ngừng ${counts.DOWN}${counts.NONE ? ` · Chưa đo ${counts.NONE}` : ""}`, icon: Server, color: counts.DOWN ? colors.danger : counts.DEGRADED ? colors.warning : colors.success, error: status.error },
    { label: "Báo cáo đang mở", value: String(stats.data?.byStatus.OPEN ?? "–"), detail: `${stats.data?.byStatus.IN_REVIEW ?? 0} đang xem xét · ${stats.data?.total ?? 0} tổng`, icon: Flag, color: colors.primary, error: stats.error },
    { label: `Đã xử lý (${windowText[window]})`, value: String(stats.data?.resolvedInWindow ?? "–"), detail: "Báo cáo chuyển sang Đã xử lý", icon: CheckCheck, color: colors.success, error: stats.error },
  ];

  const card = (key: string, title: string, icon: LucideIcon, body: React.ReactNode) => (
    <View key={key} style={[styles.card, local.chartCard, { width: chartGrid.cellWidth ?? "100%" }]}>
      <View style={styles.row}>
        <AppIcon icon={icon} size="sm" color={colors.primary} />
        <Text style={[styles.title, local.flex]} accessibilityRole="header">{title}</Text>
      </View>
      {body}
    </View>
  );
  const sectionState = (error: string | null, isEmpty: boolean, emptyText: string, onRetry: () => void, isLoading = false) =>
    isLoading ? <ScreenState loading /> : error ? <ScreenState error={error} onRetry={onRetry} /> : isEmpty ? <ScreenState empty emptyIcon={ChartColumn} emptyText={emptyText} /> : null;

  return (
    <ScrollView
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      <Segmented<Window> label="Khoảng thời gian" value={window} onChange={setWindow} options={[{ value: "24h", label: "24 giờ" }, { value: "7d", label: "7 ngày" }]} />

      <View style={[styles.wrapRow, { gap: kpiGrid.gap }]} onLayout={kpiGrid.onLayout}>
        {kpis.map((kpi) => (
          <View key={kpi.label} style={[styles.card, local.kpi, { width: kpiGrid.cellWidth ?? "100%" }]} accessible accessibilityLabel={kpi.error ? `${kpi.label}: lỗi tải dữ liệu` : `${kpi.label}: ${kpi.value}. ${kpi.detail}`}>
            <View style={styles.row}>
              <AppIcon icon={kpi.icon} size="sm" color={kpi.error ? colors.muted : kpi.color} />
              <Text style={[styles.caption, local.flex]} numberOfLines={1}>{kpi.label}</Text>
            </View>
            <Text style={[local.kpiValue, { color: kpi.error ? colors.muted : kpi.color }]} numberOfLines={2}>{kpi.error ? "–" : kpi.value}</Text>
            <Text style={styles.caption} numberOfLines={2}>{kpi.error ? "Không tải được" : kpi.detail}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.wrapRow, { gap: chartGrid.gap }]} onLayout={chartGrid.onLayout}>
        {card("by-status", "Báo cáo theo trạng thái", ChartColumn,
          sectionState(stats.error, (stats.data?.total ?? 0) === 0, "Chưa có báo cáo nào.", () => void loadOverview())
          ?? <BarChart integer data={reportStatuses} accessibilityLabel={`Báo cáo theo trạng thái: ${reportStatuses.map((item) => `${item.label} ${item.value}`).join(", ")}.`} />)}
        {card("by-category", "Báo cáo theo loại", ChartColumn,
          sectionState(stats.error, (stats.data?.total ?? 0) === 0, "Chưa có báo cáo nào.", () => void loadOverview())
          ?? <BarChart integer data={reportCategories} accessibilityLabel={`Báo cáo theo loại: ${reportCategories.map((item) => `${item.label} ${item.value}`).join(", ")}.`} />)}
      </View>

      <View style={local.pickerBlock}>
        <Text style={styles.title} accessibilityRole="header">Theo thời gian ({windowText[window]})</Text>
        <View style={styles.row}>
          <MultiDropdown
            label="Dịch vụ"
            value={selectedServices}
            onChange={setSelectedServices}
            countLabel={(count) => `${count} dịch vụ`}
            options={services.map((item) => ({ value: item.serviceName, label: shortName(item.serviceName) }))}
          />
        </View>
      </View>

      <View style={[styles.wrapRow, { gap: chartGrid.gap }]}>
        {card("response", "Thời gian phản hồi (ms)", ChartLine,
          sectionState(series.error, seriesEmpty, "Chưa có lần đo nào trong khoảng này.", () => void loadSeries(), seriesLoading && !series.data)
          ?? <LineChart
            xLabels={xLabels}
            series={[{ label: "Trung bình", values: avg, color: chartColors.series[0] }, { label: "p95", values: p95, color: chartColors.series[1], dashed: true }]}
            accessibilityLabel={avgRange
              ? `Thời gian phản hồi của ${serviceLabel} trong ${windowText[window]}: trung bình từ ${formatNumber(avgRange.min)} đến ${formatNumber(avgRange.max)} mili giây, gần nhất ${formatNumber(avgRange.last)}. P95 cao nhất ${formatNumber(p95Range?.max ?? 0)} mili giây. ${avgRange.count} trên ${buckets.length} khoảng có dữ liệu.`
              : `Thời gian phản hồi của ${serviceLabel}: không có dữ liệu.`} />)}
        {card("uptime-time", "Uptime theo thời gian (%)", Activity,
          sectionState(series.error, seriesEmpty, "Chưa có lần đo nào trong khoảng này.", () => void loadSeries(), seriesLoading && !series.data)
          ?? <LineChart
            xLabels={xLabels}
            domainMax={100}
            domainMin={uptimeAxisMin}
            formatValue={(value) => `${formatNumber(value)}`}
            series={[{ label: "Uptime", values: uptime, color: chartColors.series[0] }]}
            accessibilityLabel={uptimeRange
              ? `Uptime của ${serviceLabel} trong ${windowText[window]}: thấp nhất ${formatNumber(uptimeRange.min)} phần trăm, gần nhất ${formatNumber(uptimeRange.last)} phần trăm.`
              : `Uptime của ${serviceLabel}: không có dữ liệu.`} />)}
      </View>

      <View style={[styles.card, local.chartCard]}>
        <View style={styles.row}>
          <AppIcon icon={Server} size="sm" color={colors.primary} />
          <Text style={[styles.title, local.flex]} accessibilityRole="header">Uptime theo dịch vụ ({windowText[window]})</Text>
        </View>
        {sectionState(summary.error, perServiceKnown.length === 0, "Chưa có lần đo nào trong khoảng này.", () => void loadOverview())
          ?? <BarChart
            orientation="horizontal"
            domainMax={100}
            data={perService}
            formatValue={(value) => `${formatNumber(value)}%`}
            accessibilityLabel={`Uptime theo dịch vụ trong ${windowText[window]}, thấp nhất trước: ${perServiceKnown.map((item) => `${item.label} ${formatNumber(item.value ?? 0)} phần trăm`).join(", ")}.`} />}
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  kpi: { gap: spacing.xs, minHeight: 104 },
  kpiValue: typography.subheading,
  chartCard: { gap: spacing.md },
  pickerBlock: { gap: spacing.xs },
});
