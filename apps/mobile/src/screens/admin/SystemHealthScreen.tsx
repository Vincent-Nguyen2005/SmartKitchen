import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, CircleCheck, CircleQuestionMark, CircleX, RefreshCw, Server, Snail, TriangleExclamationPoint } from "lucide-react-native";
import { AppIcon, type LucideIcon } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Badge, Button, colors, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";
import { needsAttention, Severity, severityOf, SLOW_P95_MS } from "./healthTriage";

type Status = "UP" | "DOWN" | "DEGRADED" | null;
type StatusResponse = { overall: "UP" | "DOWN" | "DEGRADED" | "UNKNOWN"; checkedAt: string | null; services: { serviceName: string; status: Status; responseTimeMs: number | null; checkedAt: string | null }[] };
type SummaryResponse = { window: "24h" | "7d"; services: { serviceName: string; samples: number; uptimePercent: number | null; avgResponseTimeMs: number | null; p95ResponseTimeMs: number | null }[] };

const statusColor = (status: Status | "UNKNOWN"): string =>
  status === "UP" ? colors.success : status === "DEGRADED" ? colors.warning : status === "DOWN" ? colors.danger : colors.muted;
const statusLabel = (status: Status | "UNKNOWN"): string =>
  status === "UP" ? "Hoạt động" : status === "DEGRADED" ? "Chậm" : status === "DOWN" ? "Ngừng" : "Chưa có dữ liệu";
const statusBackground = (status: Status | "UNKNOWN"): string =>
  status === "UP" ? colors.successSoft : status === "DEGRADED" ? colors.warningSoft : status === "DOWN" ? colors.dangerSoft : colors.background;
const statusIcon = (status: Status | "UNKNOWN"): LucideIcon =>
  status === "UP" ? CircleCheck : status === "DEGRADED" ? TriangleExclamationPoint : status === "DOWN" ? CircleX : CircleQuestionMark;

export default function SystemHealthScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter } = useLayout();
  const grid = useGridCell(columns);
  const [window, setWindow] = useState<"24h" | "7d">("24h");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const [statusResult, summaryResult] = await Promise.all([
        api.get<StatusResponse>("/api/admin/health-monitor/status"),
        api.get<SummaryResponse>(`/api/admin/health-monitor/summary?window=${window}`),
      ]);
      setStatus(statusResult); setSummary(summaryResult); setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [api, window]);

  useEffect(() => { void load(); }, [load]);

  const checkNow = async () => {
    setChecking(true);
    try {
      await api.post("/api/admin/health-monitor/check-now");
      await load(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setChecking(false);
    }
  };

  if (loading || (!status && error)) return <ScreenState loading={loading} error={error} onRetry={() => void load()} />;
  if (!status) return <ScreenState empty emptyIcon={Server} />;
  const byName = new Map((summary?.services ?? []).map((service) => [service.serviceName, service]));
  // Problems first (down, degraded, no data, slow), healthy last; healthy cards stay collapsed by default.
  const ranked = status.services
    .map((service) => {
      const stats = byName.get(service.serviceName);
      return { service, stats, severity: severityOf(service.status, stats?.p95ResponseTimeMs) };
    })
    .sort((a, b) => a.severity - b.severity || a.service.serviceName.localeCompare(b.service.serviceName));
  const problems = ranked.filter((entry) => needsAttention(entry.severity));
  const healthyCount = ranked.length - problems.length;
  const allHealthy = ranked.length > 0 && problems.length === 0;
  const visible = showHealthy ? ranked : problems;

  return (
    <ScrollView
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
    >
      <View style={[styles.card, styles.wrapRow, local.overall]}>
        <View style={[styles.row, local.overallText]} accessible accessibilityLabel={`Tổng thể: ${statusLabel(status.overall)}`}>
          <AppIcon icon={statusIcon(status.overall)} size="xl" color={statusColor(status.overall)} />
          <View style={local.flex}>
            <Text style={styles.muted}>Tổng thể</Text>
            <Text style={[styles.headline, { color: statusColor(status.overall) }]}>{statusLabel(status.overall)}</Text>
            <Text style={styles.caption}>{status.checkedAt ? `Kiểm tra lúc ${new Date(status.checkedAt).toLocaleString("vi-VN")}` : "Chưa có lần kiểm tra nào"}</Text>
          </View>
        </View>
        <Button label="Kiểm tra ngay" icon={RefreshCw} onPress={() => void checkNow()} busy={checking} />
      </View>
      <Segmented<"24h" | "7d"> label="Khoảng thời gian" value={window} onChange={setWindow} options={[{ value: "24h", label: "24 giờ" }, { value: "7d", label: "7 ngày" }]} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {allHealthy ? (
        <View style={[styles.card, local.banner]} accessible accessibilityLiveRegion="polite">
          <AppIcon icon={CircleCheck} size="lg" color={colors.success} />
          <Text style={[styles.subtitle, local.flex, { color: colors.success }]}>Tất cả {ranked.length} dịch vụ hoạt động bình thường ✓</Text>
        </View>
      ) : null}
      {visible.length > 0 ? (
        <View style={[styles.wrapRow, { gap: grid.gap }]} onLayout={grid.onLayout}>
          {visible.map(({ service, stats, severity }) => {
            const slow = severity === Severity.Slow;
            const color = slow ? colors.warning : statusColor(service.status);
            return (
              <View
                key={service.serviceName}
                style={[styles.card, local.service, { borderLeftColor: color, width: grid.cellWidth ?? "100%" }]}
                accessible
                accessibilityLabel={`${service.serviceName}: ${slow ? `phản hồi chậm, p95 ${stats?.p95ResponseTimeMs} mili giây` : statusLabel(service.status)}. Uptime ${stats?.uptimePercent ?? "không rõ"} phần trăm.`}
              >
                <View style={styles.spaceBetween}>
                  <Text style={[styles.subtitle, local.flex]} numberOfLines={1}>{service.serviceName}</Text>
                  {slow
                    ? <Badge label={`Chậm (p95 > ${SLOW_P95_MS} ms)`} icon={Snail} color={colors.warning} background={colors.warningSoft} />
                    : <Badge label={statusLabel(service.status)} icon={statusIcon(service.status)} color={statusColor(service.status)} background={statusBackground(service.status)} />}
                </View>
                <Text style={styles.muted}>
                  Uptime {stats?.uptimePercent ?? "–"}% · TB {stats?.avgResponseTimeMs ?? "–"} ms · p95 {stats?.p95ResponseTimeMs ?? "–"} ms
                </Text>
                <Text style={styles.caption}>{stats?.samples ?? 0} lần đo · lần cuối {service.responseTimeMs ?? "–"} ms</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {healthyCount > 0 && problems.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showHealthy }}
          accessibilityLabel={showHealthy ? "Ẩn các dịch vụ hoạt động bình thường" : `${healthyCount} dịch vụ khác hoạt động bình thường. Hiện tất cả`}
          onPress={() => setShowHealthy((value) => !value)}
          style={({ pressed }) => [styles.row, local.toggle, pressed && styles.pressed]}
        >
          <Text style={styles.muted}>{showHealthy ? "Ẩn các dịch vụ hoạt động bình thường" : `${healthyCount} dịch vụ khác hoạt động bình thường`}</Text>
          <AppIcon icon={showHealthy ? ChevronUp : ChevronDown} size="sm" color={colors.muted} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { gap: 12 },
  overall: { alignItems: "center", justifyContent: "space-between" },
  overallText: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
  flex: { flex: 1, minWidth: 0 },
  service: { borderLeftWidth: 4, gap: 4 },
  banner: { alignItems: "center", borderColor: colors.success, flexDirection: "row", gap: 12 },
  toggle: { alignSelf: "flex-start", minHeight: 44 },
});
