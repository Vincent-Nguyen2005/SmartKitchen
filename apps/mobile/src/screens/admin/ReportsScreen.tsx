import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, CircleCheck, CircleExclamationPoint, CircleX, Clock, Flag, FlagOff, MousePointerClick } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, IconButton, type LucideIcon } from "../../theme";
import { errorMessage, GatewayApiError, query, type Page } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Badge, Button, colors, Field, ScreenState, Segmented, styles, useLayout } from "../notifications/ui";

type ReportStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
type Category = "ABUSE" | "SPAM" | "BUG" | "OTHER";
type Report = {
  id: string; reporterUserId: string; reportedUserId: string | null; category: Category; description: string;
  status: ReportStatus; resolvedBy: string | null; resolutionNote: string | null; resolvedAt: string | null; createdAt: string;
};

const statusText: Record<ReportStatus, string> = { OPEN: "Mới", IN_REVIEW: "Đang xem xét", RESOLVED: "Đã xử lý", REJECTED: "Từ chối" };
const categoryText: Record<Category, string> = { ABUSE: "Lạm dụng", SPAM: "Spam", BUG: "Lỗi", OTHER: "Khác" };
// Mirrors admin-service: OPEN -> IN_REVIEW | REJECTED, IN_REVIEW -> RESOLVED | REJECTED.
const statusStyle: Record<ReportStatus, { icon: LucideIcon; color: string; background: string }> = {
  OPEN: { icon: Flag, color: colors.primary, background: colors.primarySoft },
  IN_REVIEW: { icon: Clock, color: colors.warning, background: colors.warningSoft },
  RESOLVED: { icon: CircleCheck, color: colors.success, background: colors.successSoft },
  REJECTED: { icon: CircleX, color: colors.danger, background: colors.dangerSoft },
};
const StatusBadge = ({ status }: { status: ReportStatus }) => (
  <Badge label={statusText[status]} icon={statusStyle[status].icon} color={statusStyle[status].color} background={statusStyle[status].background} />
);
const nextStatuses: Record<ReportStatus, Exclude<ReportStatus, "OPEN">[]> = { OPEN: ["IN_REVIEW", "REJECTED"], IN_REVIEW: ["RESOLVED", "REJECTED"], RESOLVED: [], REJECTED: [] };

type StatusFilter = ReportStatus | "ALL";
type CategoryFilter = Category | "ALL";

export default function ReportsScreen(): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isSplit } = useLayout();
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

  // Filters are the list header, so on short screens (phones in landscape) they scroll away with the list.
  // While loading or after an error the list is empty and shows the state instead (same requests as before).
  const showState = loading || Boolean(error && items.length === 0);
  const filters = (
    <View>
      <Segmented<StatusFilter> label="Lọc theo trạng thái" value={status} onChange={setStatus}
        options={[{ value: "OPEN", label: "Mới" }, { value: "IN_REVIEW", label: "Đang xem xét" }, { value: "RESOLVED", label: "Đã xử lý" }, { value: "REJECTED", label: "Từ chối" }, { value: "ALL", label: "Tất cả" }]} />
      <Segmented<CategoryFilter> label="Lọc theo loại" value={category} onChange={setCategory}
        options={[{ value: "ALL", label: "Mọi loại" }, { value: "ABUSE", label: "Lạm dụng" }, { value: "SPAM", label: "Spam" }, { value: "BUG", label: "Lỗi" }, { value: "OTHER", label: "Khác" }]} />
    </View>
  );
  const list = (
    <FlatList
      style={local.flex}
      data={showState ? [] : items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={local.listContent}
      ListHeaderComponent={filters}
      refreshControl={showState ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => void load(1, true)} tintColor={colors.primary} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (!showState && items.length < total) void load(page + 1); }}
      ListEmptyComponent={showState
        ? <ScreenState loading={loading} error={error} onRetry={() => void load(1)} />
        : <ScreenState empty emptyIcon={FlagOff} emptyText="Không có báo cáo nào." />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${categoryText[item.category]}, ${statusText[item.status]}. ${item.description}`}
          accessibilityState={{ selected: selected?.id === item.id }}
          onPress={() => setSelected(item)}
          style={({ pressed }) => [styles.card, local.card, selected?.id === item.id && local.selected, pressed && styles.pressed]}
        >
          <View style={styles.spaceBetween}>
            <Text style={[styles.muted, local.flex]} numberOfLines={1}>{categoryText[item.category]} · {new Date(item.createdAt).toLocaleDateString("vi-VN")}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text numberOfLines={2} style={styles.body}>{item.description}</Text>
        </Pressable>
      )}
    />
  );

  // Wide and tall enough (tablets): list and detail side by side. Phones, including phones in
  // landscape where the height is too small for two panes, open the detail as a full-screen modal.
  if (isSplit) {
    return (
      <View style={[styles.screen, local.split, { paddingHorizontal: gutter }]}>
        <View style={local.flex}>{list}</View>
        <View style={[local.flex, local.detailPane]}>
          {selected ? <ReportDetail report={selected} onUpdated={onUpdated} padding={0} /> : <ScreenState empty emptyIcon={MousePointerClick} emptyText="Chọn một báo cáo để xem chi tiết." />}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.screen, { paddingHorizontal: gutter }]}>
      {list}
      <Modal visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={styles.screen}>
          <View style={[styles.row, local.modalHeader, { paddingHorizontal: gutter - 8 }]}>
            <IconButton icon={ChevronLeft} size="lg" accessibilityLabel="Quay lại danh sách" onPress={() => setSelected(null)} />
            <Text style={[styles.headline, local.flex]} accessibilityRole="header" numberOfLines={1}>Chi tiết báo cáo</Text>
          </View>
          {selected ? <ReportDetail report={selected} onUpdated={onUpdated} padding={gutter} /> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ReportDetail({ report, onUpdated, padding }: { report: Report; onUpdated: (report: Report) => void; padding: number }): React.JSX.Element {
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
    <ScrollView contentContainerStyle={[local.detail, { padding }]}>
      <View style={styles.wrapRow}>
        <Text style={[styles.title, local.flex]}>{categoryText[report.category]}</Text>
        <StatusBadge status={report.status} />
      </View>
      <Text style={styles.muted}>Người báo cáo: {report.reporterUserId}{report.reportedUserId ? ` · Bị báo cáo: ${report.reportedUserId}` : ""}</Text>
      <Text style={styles.muted}>Gửi lúc {new Date(report.createdAt).toLocaleString("vi-VN")}</Text>
      <View style={styles.card}><Text style={styles.body}>{report.description}</Text></View>
      {report.resolutionNote ? <Text style={styles.body}>Ghi chú: {report.resolutionNote}{report.resolvedBy ? ` (bởi ${report.resolvedBy})` : ""}</Text> : null}
      {allowed.length ? (
        <>
          <Field label="Ghi chú xử lý (bắt buộc khi xử lý / từ chối)" value={note} onChangeText={setNote} multiline maxLength={2000} style={local.note} />
          <View style={styles.wrapRow}>
            {allowed.map((to) => (
              <Button key={to} label={statusText[to]} icon={statusStyle[to].icon} variant={to === "REJECTED" ? "danger" : "primary"} busy={busy === to} disabled={busy !== null} onPress={() => void change(to)} accessibilityLabel={`Chuyển sang ${statusText[to]}`} />
            ))}
          </View>
        </>
      ) : <Text style={styles.muted}>Báo cáo đã đóng, không thể đổi trạng thái.</Text>}
      {message ? (
        <View style={[styles.row, local.message]} accessibilityLiveRegion="polite">
          <AppIcon icon={message.tone === "error" ? CircleExclamationPoint : CircleCheck} size="sm" color={message.tone === "error" ? colors.danger : colors.success} />
          <Text style={[local.flex, { color: message.tone === "error" ? colors.danger : colors.success }]}>{message.text}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  listContent: { gap: 10, paddingBottom: 24 },
  card: { gap: 6 },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  split: { flexDirection: "row", gap: 16 },
  detailPane: { paddingTop: 8 },
  modalHeader: { borderBottomColor: colors.border, borderBottomWidth: 1, minHeight: 56 },
  detail: { gap: 10 },
  note: { minHeight: 88, paddingTop: 10, textAlignVertical: "top" },
  message: { alignItems: "flex-start" },
});
