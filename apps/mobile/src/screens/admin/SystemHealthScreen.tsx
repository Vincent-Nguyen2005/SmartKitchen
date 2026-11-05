import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { CircleCheck, CircleQuestionMark, CircleX, RefreshCw, Server, TriangleExclamationPoint } from "lucide-react-native";
import { AppIcon, type LucideIcon } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Badge, Button, colors, ScreenState, Segmented, styles, useGridCell, useLayout } from "../notifications/ui";

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
      <View style={[styles.wrapRow, { gap: grid.gap }]} onLayout={grid.onLayout}>
        {status.services.map((service) => {
          const stats = byName.get(service.serviceName);
          return (
            <View
              key={service.serviceName}
              style={[styles.card, local.service, { borderLeftColor: statusColor(service.status), width: grid.cellWidth ?? "100%" }]}
              accessible
              accessibilityLabel={`${service.serviceName}: ${statusLabel(service.status)}. Uptime ${stats?.uptimePercent ?? "không rõ"} phần trăm.`}
            >
              <View style={styles.spaceBetween}>
                <Text style={[styles.subtitle, local.flex]} numberOfLines={1}>{service.serviceName}</Text>
                <Badge label={statusLabel(service.status)} icon={statusIcon(service.status)} color={statusColor(service.status)} background={statusBackground(service.status)} />
              </View>
              <Text style={styles.muted}>
                Uptime {stats?.uptimePercent ?? "–"}% · TB {stats?.avgResponseTimeMs ?? "–"} ms · p95 {stats?.p95ResponseTimeMs ?? "–"} ms
              </Text>
              <Text style={styles.caption}>{stats?.samples ?? 0} lần đo · lần cuối {service.responseTimeMs ?? "–"} ms</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { gap: 12 },
  overall: { alignItems: "center", justifyContent: "space-between" },
  overallText: { flexGrow: 1, flexShrink: 1, minWidth: 200 },
  flex: { flex: 1, minWidth: 0 },
  service: { borderLeftWidth: 4, gap: 4 },
});
