import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, colors, Field, ScreenState, Segmented, styles, useLayout } from "../notifications/ui";

type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
type Category = "ABUSE" | "SPAM" | "BUG" | "OTHER";
type Report = {
  id: string; reporterUserId: string; reportedUserId: string | null; category: Category; description: string;
  status: ReportStatus; resolvedBy: string | null; resolutionNote: string | null; resolvedAt: string | null; createdAt: string;
};

const statusText: Record<ReportStatus, string> = { OPEN: "Mới", IN_REVIEW: "Đang xem xét", RESOLVED: "Đã xử lý", REJECTED: "Từ chối" };
const categoryText: Record<Category, string> = { ABUSE: "Lạm dụng", SPAM: "Spam", BUG: "Lỗi", OTHER: "Khác" };
// Mirrors admin-service: OPEN -> IN_REVIEW | REJECTED, IN_REVIEW -> RESOLVED | REJECTED.
const nextStatuses: Record<ReportStatus, Exclude<ReportStatus, "OPEN">[]> = { OPEN: ["IN_REVIEW", "REJECTED"], IN_REVIEW: ["RESOLVED", "REJECTED"], RESOLVED: [], REJECTED: [] };

type StatusFilter = ReportStatus | "ALL";
type CategoryFilter = Category | "ALL";

export default function ReportsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [items, setItems] = useState<Report[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage: number, refresh = false) => {
    const id = ++requestId.current;
    if (refresh) setRefreshing(true); else if (nextPage === 1) setLoading(true);
    try {
      const result = await api.get<Page<Report>>(`/api/admin/reports${query({
        status: status === "ALL" ? undefined : status, category: category === "ALL" ? undefined : category,
        sort: "createdAt:desc", page: nextPage, limit: 20,
      })}`);
      if (id !== requestId.current) return;
      setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage); setTotal(result.total); setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [api, category, status]);

  useEffect(() => { void load(1); }, [load]);

  const onUpdated = (report: Report) => {
    setSelected(report);
    setItems((current) => current.map((entry) => (entry.id === report.id ? report : entry)));
  };

  const list = (
    <View style={{ flex: 1 }}>
      <Segmented<StatusFilter> label="Lọc theo trạng thái" value={status} onChange={setStatus}
        options={[{ value: "OPEN", label: "Mới" }, { value: "IN_REVIEW", label: "Đang xem xét" }, { value: "RESOLVED", label: "Đã xử lý" }, { value: "REJECTED", label: "Từ chối" }, { value: "ALL", label: "Tất cả" }]} />
      <Segmented<CategoryFilter> label="Lọc theo loại" value={category} onChange={setCategory}
        options={[{ value: "ALL", label: "Mọi loại" }, { value: "ABUSE", label: "Lạm dụng" }, { value: "SPAM", label: "Spam" }, { value: "BUG", label: "Lỗi" }, { value: "OTHER", label: "Khác" }]} />
      {loading || (error && items.length === 0) ? <ScreenState loading={loading} error={error} onRetry={() => void load(1)} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (items.length < total) void load(page + 1); }}
          ListEmptyComponent={<ScreenState empty emptyText="Không có báo cáo nào." />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${categoryText[item.category]}, ${statusText[item.status]}. ${item.description}`}
              accessibilityState={{ selected: selected?.id === item.id }}
              onPress={() => setSelected(item)}
              style={[styles.card, selected?.id === item.id && { borderColor: colors.primary, borderWidth: 2 }]}
            >
              <View style={[styles.row, { justifyContent: "space-between" }]}>
                <Text style={{ color: colors.muted }}>{categoryText[item.category]} · {new Date(item.createdAt).toLocaleDateString("vi-VN")}</Text>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>{statusText[item.status]}</Text>
              </View>
              <Text numberOfLines={2} style={{ color: colors.text, marginTop: 4 }}>{item.description}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  // Tablets / landscape: list and detail side by side. Phones: detail opens as a full-screen modal.
  if (isWide) {
    return (
      <View style={[styles.screen, { flexDirection: "row", gap: 16, paddingHorizontal: gutter }]}>
        <View style={{ flex: 1 }}>{list}</View>
        <View style={{ flex: 1, paddingTop: 8 }}>
          {selected ? <ReportDetail report={selected} onUpdated={onUpdated} /> : <ScreenState empty emptyText="Chọn một báo cáo để xem chi tiết." />}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      {list}
      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
          <View style={{ padding: gutter }}><Button variant="secondary" label="Quay lại danh sách" onPress={() => setSelected(null)} /></View>
          {selected ? <ReportDetail report={selected} onUpdated={onUpdated} /> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ReportDetail({ report, onUpdated }: { report: Report; onUpdated: (report: Report) => void }): React.JSX.Element {
  const { api } = useGatewayApi();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  useEffect(() => { setNote(""); setMessage(null); }, [report.id]);

  const change = async (to: Exclude<ReportStatus, "OPEN">) => {
    if ((to === "RESOLVED" || to === "REJECTED") && !note.trim()) {
      setMessage({ text: "Cần nhập ghi chú khi xử lý hoặc từ chối báo cáo.", tone: "error" });
      return;
    }
    setBusy(to); setMessage(null);
    try {
      const updated = await api.patch<Report & { notification?: string }>(`/api/admin/reports/${encodeURIComponent(report.id)}/status`, { status: to, resolutionNote: note.trim() || undefined });
      onUpdated(updated);
      const notified = updated.notification === "failed" ? " (chưa gửi được thông báo cho người báo cáo)" : "";
      setMessage({ text: `Đã chuyển sang "${statusText[to]}"${notified}.`, tone: "success" });
      setNote("");
    } catch (caught) {
      const text = caught instanceof GatewayApiError && caught.status === 409
        ? "Báo cáo đã được xử lý bởi người khác hoặc không thể chuyển trạng thái này. Hãy làm mới danh sách."
        : errorMessage(caught);
      setMessage({ text, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const allowed = nextStatuses[report.status];
  return (
    <ScrollView contentContainerStyle={{ gap: 10, padding: 16 }}>
      <Text style={styles.title}>{categoryText[report.category]} · {statusText[report.status]}</Text>
      <Text style={{ color: colors.muted }}>Người báo cáo: {report.reporterUserId}{report.reportedUserId ? ` · Bị báo cáo: ${report.reportedUserId}` : ""}</Text>
      <Text style={{ color: colors.muted }}>Gửi lúc {new Date(report.createdAt).toLocaleString("vi-VN")}</Text>
      <View style={styles.card}><Text style={{ color: colors.text }}>{report.description}</Text></View>
      {report.resolutionNote ? <Text style={{ color: colors.text }}>Ghi chú: {report.resolutionNote}{report.resolvedBy ? ` (bởi ${report.resolvedBy})` : ""}</Text> : null}
      {allowed.length ? (
        <>
          <Field label="Ghi chú xử lý (bắt buộc khi xử lý / từ chối)" value={note} onChangeText={setNote} multiline maxLength={2000} style={[styles.input, { minHeight: 88, paddingTop: 10, textAlignVertical: "top" }]} />
          <View style={styles.wrapRow}>
            {allowed.map((to) => (
              <Button key={to} label={statusText[to]} variant={to === "REJECTED" ? "danger" : "primary"} busy={busy === to} disabled={busy !== null} onPress={() => void change(to)} accessibilityLabel={`Chuyển sang ${statusText[to]}`} />
            ))}
          </View>
        </>
      ) : <Text style={{ color: colors.muted }}>Báo cáo đã đóng, không thể đổi trạng thái.</Text>}
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: message.tone === "error" ? colors.danger : colors.success }}>{message.text}</Text> : null}
    </ScrollView>
  );
}
