import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Activity, ChevronRight, Flag, House, ServerCrash, UserPlus, Users, type LucideIcon } from "lucide-react-native";
import { AppIcon, AppText, colors, spacing } from "../../theme";
import { errorMessage, query } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";
import { fetchFamilies, fetchUsers, MAX_PAGE_SIZE, type AdminFamilySummary, type AdminUser } from "./directoryApi";
import { directoryStyles, FamilyRow, UserRow } from "./directoryUi";
import type { ServiceStatus } from "./healthTriage";
import { countNewUsers, NEW_USER_DAYS, reportsDetail, servicesDetail, servicesSummary } from "./overviewStats";

type Overall = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
type StatusResponse = { overall: Overall; checkedAt: string | null; services: { serviceName: string; status: ServiceStatus }[] };
type SummaryResponse = { services: { serviceName: string; p95ResponseTimeMs: number | null }[] };
type StatsResponse = { total: number; byStatus: Record<"OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED", number>; resolvedInWindow?: number | null };
type Section<T> = { data: T | null; error: string | null };
type Recent<T> = { items: T[]; total: number };

// The dashboard only previews the newest rows; "Xem tất cả" opens the full lists.
const RECENT_COUNT = 5;
// Report and response-time numbers cover the last 24 hours.
const WINDOW = "24h";
const overallText: Record<Overall, string> = { UP: "Hoạt động", DEGRADED: "Chậm", DOWN: "Ngừng", UNKNOWN: "Chưa rõ" };
const overallColor: Record<Overall, string> = { UP: colors.success, DEGRADED: colors.warning, DOWN: colors.danger, UNKNOWN: colors.muted };

const empty = <T,>(): Section<T> => ({ data: null, error: null });
const toSection = <T,>(result: PromiseSettledResult<T>): Section<T> =>
  result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };

export interface AdminDashboardScreenProps {
  onOpenUsers: () => void;
  onOpenFamilies: () => void;
  onOpenFamily: (family: AdminFamilySummary) => void;
  /** "Báo cáo chờ xử lý" opens the Báo cáo tab (on its "Mới" filter). */
  onOpenReports: () => void;
}

type Card = { key: string; label: string; value: string; icon: LucideIcon; color: string; error: string | null; detail?: string; onPress?: () => void; hint?: string };

/**
 * Admin landing page "Tổng quan" (SCRUM-283): totals, new users, system status, services with a problem, reports to
 * handle (merged from the former "Thống kê" tab), then the newest users and families.
 */
export default function AdminDashboardScreen({ onOpenUsers, onOpenFamilies, onOpenFamily, onOpenReports }: AdminDashboardScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const cardGrid = useGridCell(isWide ? 3 : 2);
  const listGrid = useGridCell(isWide ? 2 : 1);
  const [users, setUsers] = useState<Section<Recent<AdminUser>>>(empty);
  const [families, setFamilies] = useState<Section<Recent<AdminFamilySummary>>>(empty);
  const [status, setStatus] = useState<Section<StatusResponse>>(empty);
  const [summary, setSummary] = useState<Section<SummaryResponse>>(empty);
  const [stats, setStats] = useState<Section<StatsResponse>>(empty);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [usersResult, familiesResult, statusResult, summaryResult, statsResult] = await Promise.allSettled([
      // One newest-first page serves the total, the new-user count and the recent list.
      fetchUsers(api, MAX_PAGE_SIZE),
      fetchFamilies(api, RECENT_COUNT),
      api.get<StatusResponse>("/api/admin/health-monitor/status"),
      api.get<SummaryResponse>(`/api/admin/health-monitor/summary${query({ window: WINDOW })}`),
      api.get<StatsResponse>(`/api/admin/reports/stats${query({ window: WINDOW })}`),
    ]);
    if (id !== requestId.current) return; // a newer refresh replaced this one
    setUsers(toSection(usersResult));
    setFamilies(toSection(familiesResult));
    setStatus(toSection(statusResult));
    setSummary(toSection(summaryResult));
    setStats(toSection(statsResult));
  }, [api]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const nothingLoaded = !users.data && !families.data && !status.data && !stats.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && users.error && families.error && status.error && stats.error) {
    return <ScreenState error={users.error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />;
  }

  const recentUsers = (users.data?.items ?? []).slice(0, RECENT_COUNT);
  const recentFamilies = (families.data?.items ?? []).slice(0, RECENT_COUNT);
  const overall: Overall = status.data?.overall ?? "UNKNOWN";
  const services = servicesSummary(status.data?.services ?? [], new Map((summary.data?.services ?? []).map((item) => [item.serviceName, item.p95ResponseTimeMs])));
  const openReports = stats.data?.byStatus.OPEN;
  const checkedAt = status.data?.checkedAt ? ` · lúc ${new Date(status.data.checkedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "";
  const cards: Card[] = [
    { key: "users", label: "Tổng người dùng", value: String(users.data?.total ?? "–"), icon: Users, color: colors.primary, error: users.error },
    { key: "families", label: "Tổng gia đình", value: String(families.data?.total ?? "–"), icon: House, color: colors.primary, error: families.error },
    { key: "new-users", label: `Người dùng mới (${NEW_USER_DAYS} ngày)`, value: users.data ? countNewUsers(users.data, Date.now()) : "–", icon: UserPlus, color: colors.primary, error: users.error },
    { key: "status", label: "Trạng thái hệ thống", value: overallText[overall], icon: Activity, color: overallColor[overall], error: status.error, detail: status.data ? `${servicesDetail(services)}${checkedAt}` : undefined },
    {
      key: "problems", label: "Dịch vụ có vấn đề", value: status.data ? String(services.problems.length) : "–", icon: ServerCrash,
      color: services.problems.length > 0 ? colors.danger : colors.success, error: status.error,
      detail: services.problems.length > 0 ? services.problems.join(", ") : "Tất cả hoạt động bình thường",
    },
    {
      key: "reports", label: "Báo cáo chờ xử lý", value: String(openReports ?? "–"), icon: Flag, color: openReports ? colors.warning : colors.success,
      error: stats.error, detail: stats.data ? reportsDetail(stats.data) : undefined, onPress: onOpenReports, hint: "Mở Báo cáo, lọc Mới",
    },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      <View style={[styles.wrapRow, { gap: cardGrid.gap }]} onLayout={cardGrid.onLayout}>
        {cards.map((card) => <StatCard key={card.key} card={card} width={cardGrid.cellWidth} />)}
      </View>

      <View style={[styles.wrapRow, local.lists, { gap: listGrid.gap }]} onLayout={listGrid.onLayout}>
        <View style={[styles.card, local.listCard, { width: listGrid.cellWidth ?? "100%" }]}>
          <SectionHeader title="Người dùng gần đây" linkLabel="Xem tất cả người dùng" onOpen={onOpenUsers} />
          {users.error ? <ScreenState error={users.error} onRetry={() => void load()} /> : (
            <View>
              {recentUsers.length === 0 ? <AppText variant="caption">Chưa có người dùng</AppText> : recentUsers.map((user, index) => (
                <View key={user.id}>
                  {index > 0 ? <View style={directoryStyles.separator} /> : null}
                  <UserRow user={user} />
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.card, local.listCard, { width: listGrid.cellWidth ?? "100%" }]}>
          <SectionHeader title="Gia đình gần đây" linkLabel="Xem tất cả gia đình" onOpen={onOpenFamilies} />
          {families.error ? <ScreenState error={families.error} onRetry={() => void load()} /> : (
            <View>
              {recentFamilies.length === 0 ? <AppText variant="caption">Chưa có gia đình</AppText> : recentFamilies.map((family, index) => (
                <View key={family.id}>
                  {index > 0 ? <View style={directoryStyles.separator} /> : null}
                  <FamilyRow family={family} onPress={() => onOpenFamily(family)} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

/** List card header: title on the left, "Xem tất cả" text link on the right (same style in every section). */
function SectionHeader({ title, linkLabel, onOpen }: { title: string; linkLabel: string; onOpen: () => void }): React.JSX.Element {
  return (
    <View style={local.sectionHeader}>
      <AppText variant="subheading" accessibilityRole="header" numberOfLines={1} style={local.flex}>{title}</AppText>
      <Pressable accessibilityRole="link" accessibilityLabel={linkLabel} hitSlop={8} onPress={onOpen} style={({ pressed }) => [local.link, pressed && local.linkPressed]}>
        <AppText variant="labelSmall" color={colors.primary}>Xem tất cả</AppText>
        <AppIcon icon={ChevronRight} size="sm" color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** Label (caption) + number (heading) + optional detail; tappable cards show a chevron. */
function StatCard({ card, width }: { card: Card; width?: number }): React.JSX.Element {
  const color = card.error ? colors.muted : card.color;
  const body = (
    <>
      <View style={styles.row}>
        <AppIcon icon={card.icon} size="sm" color={color} />
        <AppText variant="caption" numberOfLines={1} style={local.flex}>{card.label}</AppText>
        {card.onPress ? <AppIcon icon={ChevronRight} size="sm" color={colors.muted} /> : null}
      </View>
      <AppText variant="heading" color={color} numberOfLines={1}>{card.error ? "–" : card.value}</AppText>
      {card.error ? <AppText variant="caption">Không tải được</AppText> : card.detail ? <AppText variant="caption" numberOfLines={2}>{card.detail}</AppText> : null}
    </>
  );
  const style = [styles.card, local.card, { width: width ?? "100%" }] as const;
  const label = card.error ? `${card.label}: không tải được` : `${card.label}: ${card.value}${card.detail ? `. ${card.detail}` : ""}`;
  if (!card.onPress) return <View style={style} accessible accessibilityLabel={label}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={card.hint} onPress={card.onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.md },
  card: { gap: spacing.xs, minHeight: 96 },
  flex: { flex: 1, minWidth: 0 },
  lists: { alignItems: "flex-start" },
  listCard: { gap: spacing.sm },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44 },
  // Text link with a 44 dp touch target.
  link: { alignItems: "center", flexDirection: "row", gap: 2, justifyContent: "flex-end", minHeight: 44, paddingLeft: spacing.sm },
  linkPressed: { opacity: 0.6 },
});
