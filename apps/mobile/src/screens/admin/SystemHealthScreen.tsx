import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, colors, ScreenState, Segmented, styles, useLayout } from "../notifications/ui";

type Status = "UP" | "DOWN" | "DEGRADED" | null;
type StatusResponse = { overall: "UP" | "DOWN" | "DEGRADED" | "UNKNOWN"; checkedAt: string | null; services: { serviceName: string; status: Status; responseTimeMs: number | null; checkedAt: string | null }[] };
type SummaryResponse = { window: "24h" | "7d"; services: { serviceName: string; samples: number; uptimePercent: number | null; avgResponseTimeMs: number | null; p95ResponseTimeMs: number | null }[] };

const statusColor = (status: Status | "UNKNOWN"): string =>
  status === "UP" ? colors.success : status === "DEGRADED" ? colors.warning : status === "DOWN" ? colors.danger : colors.muted;
const statusLabel = (status: Status | "UNKNOWN"): string =>
  status === "UP" ? "Hoạt động" : status === "DEGRADED" ? "Chậm" : status === "DOWN" ? "Ngừng" : "Chưa có dữ liệu";

export default function SystemHealthScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter } = useLayout();
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
  if (!status) return <ScreenState empty />;
  const byName = new Map((summary?.services ?? []).map((service) => [service.serviceName, service]));

  return (
    <ScrollView
      contentContainerStyle={{ gap: 12, padding: gutter }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
    >
      <View style={[styles.card, styles.wrapRow, { alignItems: "center", justifyContent: "space-between" }]}>
        <View accessible accessibilityLabel={`Tổng thể: ${statusLabel(status.overall)}`}>
          <Text style={{ color: colors.muted }}>Tổng thể</Text>
          <Text style={[styles.title, { color: statusColor(status.overall), fontSize: 22 }]}>{statusLabel(status.overall)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{status.checkedAt ? `Kiểm tra lúc ${new Date(status.checkedAt).toLocaleString("vi-VN")}` : "Chưa có lần kiểm tra nào"}</Text>
        </View>
        <Button label="Kiểm tra ngay" onPress={() => void checkNow()} busy={checking} />
      </View>
      <Segmented<"24h" | "7d"> label="Khoảng thời gian" value={window} onChange={setWindow} options={[{ value: "24h", label: "24 giờ" }, { value: "7d", label: "7 ngày" }]} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {status.services.map((service) => {
          const stats = byName.get(service.serviceName);
          return (
            <View
              key={service.serviceName}
              style={[styles.card, { borderLeftColor: statusColor(service.status), borderLeftWidth: 4, flexBasis: columns === 3 ? "31%" : columns === 2 ? "47%" : "100%", flexGrow: 1 }]}
              accessible
              accessibilityLabel={`${service.serviceName}: ${statusLabel(service.status)}. Uptime ${stats?.uptimePercent ?? "không rõ"} phần trăm.`}
            >
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Text style={[styles.title, { fontSize: 15 }]}>{service.serviceName}</Text>
                <Text style={{ color: statusColor(service.status), fontWeight: "700" }}>{statusLabel(service.status)}</Text>
              </View>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Uptime {stats?.uptimePercent ?? "–"}% · TB {stats?.avgResponseTimeMs ?? "–"} ms · p95 {stats?.p95ResponseTimeMs ?? "–"} ms
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{stats?.samples ?? 0} lần đo · lần cuối {service.responseTimeMs ?? "–"} ms</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
