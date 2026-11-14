import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  CheckCheck, ChevronRight, CircleCheck, CircleQuestionMark, CircleX, Flag, Server, ServerCrash, TriangleExclamationPoint, UserPlus,
} from "lucide-react-native";
import { errorMessage, query } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { colors, MultiDropdown, ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";
import { AppIcon, AppText, spacing, typography, type LucideIcon } from "../../theme";
import { fetchUsers, MAX_PAGE_SIZE, type AdminUser } from "./directoryApi";
import { needsAttention, severityOf, type ServiceStatus } from "./healthTriage";

type Overall = "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";
type StatusResponse = { overall: Overall; checkedAt: string | null; services: { serviceName: string; status: ServiceStatus }[] };
type SummaryResponse = { services: { serviceName: string; p95ResponseTimeMs: number | null }[] };
type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
type StatsResponse = { total: number; byStatus: Record<ReportStatus, number>; resolvedInWindow?: number | null };
type UsersPage = { items: AdminUser[]; total: number };
type Section<T> = { data: T | null; error: string | null };

// The summary cards report the last 24 hours ("Đã xử lý (24 giờ)").
const WINDOW = "24h";
const NEW_USER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const empty = <T,>(): Section<T> => ({ data: null, error: null });
const toSection = <T,>(result: PromiseSettledResult<T>): Section<T> =>
  result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };
const overallText: Record<Overall, string> = { UP: "Hoạt động", DEGRADED: "Chậm", DOWN: "Ngừng", UNKNOWN: "Chưa có dữ liệu" };
const overallColor: Record<Overall, string> = { UP: colors.success, DEGRADED: colors.warning, DOWN: colors.danger, UNKNOWN: colors.muted };
const overallIcon: Record<Overall, LucideIcon> = { UP: CircleCheck, DEGRADED: TriangleExclamationPoint, DOWN: CircleX, UNKNOWN: CircleQuestionMark };
const shortName = (serviceName: string) => serviceName.replace(/-service$/, "");

/**
 * auth-service has no "created after" filter, so count the newest page (newest first, up to 100).
 * If every row on that page is recent and there are more users, the true number is higher: "100+".
 */
const countNewUsers = (page: UsersPage, now: number): string => {
  const since = now - NEW_USER_DAYS * DAY_MS;
  const recent = page.items.filter((user) => new Date(user.createdAt).getTime() >= since).length;
  return recent === page.items.length && page.total > page.items.length ? `${recent}+` : String(recent);
};

export interface DashboardScreenProps {
  /** Opens the Báo cáo tab (it starts on the "Mới" filter). */
  onOpenReports: () => void;
}

/** "Thống kê": the few numbers an admin acts on (owner: Huy). Report details live in Báo cáo. */
export default function DashboardScreen({ onOpenReports }: DashboardScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const kpiGrid = useGridCell(isWide ? 4 : 2);
  const statGrid = useGridCell(isWide ? 3 : 1);
  // Empty = all monitored services; the service cards count only the selected services.
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [status, setStatus] = useState<Section<StatusResponse>>(empty);
  const [summary, setSummary] = useState<Section<SummaryResponse>>(empty);
  const [stats, setStats] = useState<Section<StatsResponse>>(empty);
  const [users, setUsers] = useState<Section<UsersPage>>(empty);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [statusResult, summaryResult, statsResult, usersResult] = await Promise.allSettled([
      api.get<StatusResponse>("/api/admin/health-monitor/status"),
      api.get<SummaryResponse>(`/api/admin/health-monitor/summary${query({ window: WINDOW })}`),
      api.get<StatsResponse>(`/api/admin/reports/stats${query({ window: WINDOW })}`),
      fetchUsers(api, MAX_PAGE_SIZE),
    ]);
    if (id !== requestId.current) return; // a newer refresh replaced this one
    setStatus(toSection(statusResult));
    setSummary(toSection(summaryResult));
    setStats(toSection(statsResult));
    setUsers(toSection(usersResult));
  }, [api]);

  useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const nothingLoaded = !status.data && !summary.data && !stats.data && !users.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && status.error && stats.error && users.error) {
    return <ScreenState error={status.error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />;
  }

  const allServices = status.data?.services ?? [];
  const services = selectedServices.length ? allServices.filter((item) => selectedServices.includes(item.serviceName)) : allServices;
  const p95ByName = new Map((summary.data?.services ?? []).map((item) => [item.serviceName, item.p95ResponseTimeMs]));
  const counts = { UP: 0, DEGRADED: 0, DOWN: 0, NONE: 0 };
  for (const item of services) counts[item.status ?? "NONE"] += 1;
  const problemServices = services.filter((item) => needsAttention(severityOf(item.status, p95ByName.get(item.serviceName))));
  const problemCount = problemServices.length;
  const overall: Overall = status.data?.overall ?? "UNKNOWN";
  const openReports = stats.data?.byStatus.OPEN;

  const kpis: { label: string; value: string; detail: string; icon: LucideIcon; color: string; error: string | null }[] = [
    { label: "Tổng thể", value: overallText[overall], detail: status.data?.checkedAt ? `Kiểm tra lúc ${new Date(status.data.checkedAt).toLocaleTimeString("vi-VN")}` : "Chưa có lần kiểm tra", icon: overallIcon[overall], color: overallColor[overall], error: status.error },
    { label: "Dịch vụ", value: `${counts.UP}/${services.length}`, detail: `hoạt động · Chậm ${counts.DEGRADED} · Ngừng ${counts.DOWN}${counts.NONE ? ` · Chưa đo ${counts.NONE}` : ""}`, icon: Server, color: counts.DOWN ? colors.danger : counts.DEGRADED ? colors.warning : colors.success, error: status.error },
    { label: "Báo cáo đang mở", value: String(openReports ?? "–"), detail: `${stats.data?.byStatus.IN_REVIEW ?? 0} đang xem xét · ${stats.data?.total ?? 0} tổng`, icon: Flag, color: colors.primary, error: stats.error },
    { label: "Đã xử lý (24 giờ)", value: String(stats.data?.resolvedInWindow ?? "–"), detail: "Báo cáo chuyển sang Đã xử lý", icon: CheckCheck, color: colors.success, error: stats.error },
  ];

  const statCards: StatCardProps[] = [
    {
      label: `Người dùng mới (${NEW_USER_DAYS} ngày)`, icon: UserPlus, color: colors.primary, error: users.error,
      value: users.data ? countNewUsers(users.data, Date.now()) : "–",
    },
    {
      label: "Báo cáo chờ xử lý", icon: Flag, error: stats.error, onPress: onOpenReports, hint: "Mở Báo cáo, lọc Mới",
      value: String(openReports ?? "–"), color: openReports ? colors.warning : colors.success,
    },
    {
      // There is no Hệ thống tab any more, so the card names the affected services itself.
      label: "Dịch vụ có vấn đề", icon: ServerCrash, error: status.error,
      value: status.data ? String(problemCount) : "–", color: problemCount > 0 ? colors.danger : colors.success,
      detail: problemCount > 0 ? problemServices.map((item) => shortName(item.serviceName)).join(", ") : "Tất cả hoạt động bình thường",
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      <View style={styles.row}>
        <MultiDropdown
          label="Dịch vụ"
          value={selectedServices}
          onChange={setSelectedServices}
          countLabel={(count) => `${count} dịch vụ`}
          options={allServices.map((item) => ({ value: item.serviceName, label: shortName(item.serviceName) }))}
        />
      </View>

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

      <View style={[styles.wrapRow, { gap: statGrid.gap }]} onLayout={statGrid.onLayout}>
        {statCards.map((card) => <StatCard key={card.label} {...card} width={statGrid.cellWidth} />)}
      </View>
    </ScrollView>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
  error: string | null;
  /** Optional caption under the number. */
  detail?: string;
  onPress?: () => void;
  hint?: string;
  width?: number;
};

/** Label (caption) + number (heading 22). Tappable cards show a chevron and open the related tab. */
function StatCard({ label, value, icon, color, error, detail, onPress, hint, width }: StatCardProps): React.JSX.Element {
  const shownColor = error ? colors.muted : color;
  const body = (
    <>
      <View style={styles.row}>
        <AppIcon icon={icon} size="sm" color={shownColor} />
        <AppText variant="caption" numberOfLines={1} style={local.flex}>{label}</AppText>
        {onPress ? <AppIcon icon={ChevronRight} size="sm" color={colors.muted} /> : null}
      </View>
      <AppText variant="heading" color={shownColor} numberOfLines={1}>{error ? "–" : value}</AppText>
      {error ? <AppText variant="caption">Không tải được</AppText> : detail ? <AppText variant="caption" numberOfLines={2}>{detail}</AppText> : null}
    </>
  );
  const style = [styles.card, local.stat, { width: width ?? "100%" }] as const;
  const a11yLabel = error ? `${label}: không tải được` : `${label}: ${value}${detail ? `. ${detail}` : ""}`;
  if (!onPress) return <View style={style} accessible accessibilityLabel={a11yLabel}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  kpi: { gap: spacing.xs, minHeight: 104 },
  kpiValue: typography.subheading,
  stat: { gap: spacing.xs, minHeight: 88 },
});
