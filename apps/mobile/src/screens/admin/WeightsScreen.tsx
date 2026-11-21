import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { CircleCheck, CircleExclamationPoint, Info, Save, SlidersHorizontal } from "lucide-react-native";
import { AppIcon } from "../../theme";
import { errorMessage, GatewayApiError } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, colors, Field, ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";

type Weight = { id: string; key: string; value: number; description: string | null; version: number; updatedBy: string; updatedAt: string };

const labels: Record<string, string> = {
  expiry_priority: "Ưu tiên sắp hết hạn",
  nutrition_fit: "Phù hợp dinh dưỡng",
  preference_match: "Khẩu vị người dùng",
};

export default function WeightsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { columns, gutter } = useLayout();
  const grid = useGridCell(columns);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { text: string; tone: "error" | "success" }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await api.get<Weight[]>("/api/admin/weights");
      setWeights(result);
      setDrafts(Object.fromEntries(result.map((weight) => [weight.key, String(weight.value)])));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const save = async (weight: Weight) => {
    const value = Number((drafts[weight.key] ?? "").replace(",", "."));
    if (Number.isNaN(value) || value < 0 || value > 1) {
      setMessages((current) => ({ ...current, [weight.key]: { text: "Giá trị phải nằm trong khoảng 0 – 1.", tone: "error" } }));
      return;
    }
    setSaving(weight.key);
    try {
      const updated = await api.put<Weight>(`/api/admin/weights/${encodeURIComponent(weight.key)}`, { value, expectedVersion: weight.version });
      setWeights((current) => current.map((entry) => (entry.key === weight.key ? updated : entry)));
      setMessages((current) => ({ ...current, [weight.key]: { text: `Đã lưu (phiên bản ${updated.version}).`, tone: "success" } }));
    } catch (caught) {
      // expectedVersion conflict: someone else changed this weight since it was loaded.
      const text = caught instanceof GatewayApiError && caught.status === 409
        ? "Trọng số đã được người khác thay đổi. Đã tải lại giá trị mới nhất — kiểm tra rồi lưu lại."
        : errorMessage(caught);
      setMessages((current) => ({ ...current, [weight.key]: { text, tone: "error" } }));
      if (caught instanceof GatewayApiError && caught.status === 409) void load(true);
    } finally {
      setSaving(null);
    }
  };

  if (loading || (error && weights.length === 0)) return <ScreenState loading={loading} error={error} onRetry={() => void load()} />;
  const sum = weights.reduce((total, weight) => total + weight.value, 0);

  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
    >
      <View style={[styles.row, local.summary]}>
        <AppIcon icon={Info} size="sm" color={colors.muted} />
        <Text style={[styles.muted, local.flex]}>Tổng hiện tại: {sum.toFixed(2)} (nên bằng 1.00). Mỗi lần lưu gửi kèm phiên bản để tránh ghi đè thay đổi của người khác.</Text>
      </View>
      {weights.length === 0 ? <ScreenState empty emptyIcon={SlidersHorizontal} emptyText="Chưa có trọng số (chạy seed admin-service)." /> : null}
      <View style={[styles.wrapRow, { gap: grid.gap }]} onLayout={grid.onLayout}>
        {weights.map((weight) => {
          const message = messages[weight.key];
          return (
            <View key={weight.key} style={[styles.card, { width: grid.cellWidth ?? "100%" }]}>
              <Text style={styles.title}>{labels[weight.key] ?? weight.key}</Text>
              <Text style={[styles.caption, local.meta]}>{weight.key} · phiên bản {weight.version} · {weight.updatedBy}</Text>
              <Field label="Giá trị (0 – 1)" keyboardType="decimal-pad" value={drafts[weight.key] ?? ""} onChangeText={(text) => setDrafts((current) => ({ ...current, [weight.key]: text }))} />
              {message ? (
                <View style={[styles.row, local.message]} accessibilityLiveRegion="polite">
                  <AppIcon icon={message.tone === "error" ? CircleExclamationPoint : CircleCheck} size="sm" color={message.tone === "error" ? colors.danger : colors.success} />
                  <Text style={[local.flex, { color: message.tone === "error" ? colors.danger : colors.success }]}>{message.text}</Text>
                </View>
              ) : null}
              <Button label="Lưu" icon={Save} onPress={() => void save(weight)} busy={saving === weight.key} accessibilityLabel={`Lưu ${labels[weight.key] ?? weight.key}`} />
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { gap: 12 },
  summary: { alignItems: "flex-start" },
  flex: { flex: 1 },
  meta: { marginBottom: 8, marginTop: 2 },
  message: { alignItems: "flex-start", marginBottom: 8 },
});
