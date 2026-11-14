import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Activity, ChevronRight, House, Users, type LucideIcon } from "lucide-react-native";
import { AppIcon, AppText, colors, spacing, touchTarget } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Button, ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";
import { fetchFamilies, fetchUsers, type AdminFamilySummary, type AdminUser } from "./directoryApi";
import { directoryStyles, UserRow } from "./directoryUi";

type Overall = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
type StatusResponse = { overall: Overall };
type Section<T> = { data: T | null; error: string | null };

const RECENT_COUNT = 10;
const overallText: Record<Overall, string> = { UP: "Hoạt động", DEGRADED: "Chậm", DOWN: "Ngừng", UNKNOWN: "Chưa rõ" };
const overallColor: Record<Overall, string> = { UP: colors.success, DEGRADED: colors.warning, DOWN: colors.danger, UNKNOWN: colors.muted };

const empty = <T,>(): Section<T> => ({ data: null, error: null });
const toSection = <T,>(result: PromiseSettledResult<T>): Section<T> =>
  result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };

export interface AdminDashboardScreenProps {
  onOpenUsers: () => void;
  onOpenFamily: (family: AdminFamilySummary) => void;
}

type Recent<T> = { items: T[]; total: number };

/** Admin landing page (SCRUM-283): totals, system status, recent users and families. */
export default function AdminDashboardScreen({ onOpenUsers, onOpenFamily }: AdminDashboardScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const cardGrid = useGridCell(isWide ? 3 : 1);
  const listGrid = useGridCell(isWide ? 2 : 1);
  const [users, setUsers] = useState<Section<Recent<AdminUser>>>(empty);
  const [families, setFamilies] = useState<Section<Recent<AdminFamilySummary>>>(empty);
  const [status, setStatus] = useState<Section<StatusResponse>>(empty);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [usersResult, familiesResult, statusResult] = await Promise.allSettled([
      fetchUsers(api, RECENT_COUNT),
      fetchFamilies(api, RECENT_COUNT),
      api.get<StatusResponse>("/api/admin/health-monitor/status"),
    ]);
    if (id !== requestId.current) return; // a newer refresh replaced this one
    setUsers(toSection(usersResult));
    setFamilies(toSection(familiesResult));
    setStatus(toSection(statusResult));
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

  const nothingLoaded = !users.data && !families.data && !status.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && users.error && families.error && status.error) {
    return <ScreenState error={users.error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />;
  }

  const overall: Overall = status.data?.overall ?? "UNKNOWN";
  const cards: { key: string; label: string; value: string; icon: LucideIcon; color: string; error: string | null }[] = [
    { key: "users", label: "Tổng người dùng", value: String(users.data?.total ?? "–"), icon: Users, color: colors.primary, error: users.error },
    { key: "families", label: "Tổng gia đình", value: String(families.data?.total ?? "–"), icon: House, color: colors.primary, error: families.error },
    { key: "status", label: "Trạng thái hệ thống", value: overallText[overall], icon: Activity, color: overallColor[overall], error: status.error },
  ];

  return (
    <ScrollView
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      <View style={[styles.wrapRow, { gap: cardGrid.gap }]} onLayout={cardGrid.onLayout}>
        {cards.map((card) => (
          <View
            key={card.key}
            style={[styles.card, local.card, { width: cardGrid.cellWidth ?? "100%" }]}
            accessible
            accessibilityLabel={card.error ? `${card.label}: không tải được` : `${card.label}: ${card.value}`}
          >
            <View style={styles.row}>
              <AppIcon icon={card.icon} size="sm" color={card.error ? colors.muted : card.color} />
              <AppText variant="caption" numberOfLines={1} style={local.flex}>{card.label}</AppText>
            </View>
            <AppText variant="heading" color={card.error ? colors.muted : card.color} numberOfLines={1}>
              {card.error ? "–" : card.value}
            </AppText>
            {card.error ? <AppText variant="caption">Không tải được</AppText> : null}
          </View>
        ))}
      </View>

      <View style={[styles.wrapRow, local.lists, { gap: listGrid.gap }]} onLayout={listGrid.onLayout}>
        <View style={[styles.card, local.listCard, { width: listGrid.cellWidth ?? "100%" }]}>
          <View style={styles.spaceBetween}>
            <AppText variant="subheading" accessibilityRole="header" style={local.flex}>Người dùng gần đây</AppText>
            <Button label="Xem tất cả" variant="secondary" onPress={onOpenUsers} />
          </View>
          {users.error ? <ScreenState error={users.error} onRetry={() => void load()} /> : (
            <FlatList
              data={users.data?.items ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <UserRow user={item} />}
              ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
              ListEmptyComponent={<AppText variant="caption">Chưa có người dùng</AppText>}
              scrollEnabled={false}
            />
          )}
        </View>

        <View style={[styles.card, local.listCard, { width: listGrid.cellWidth ?? "100%" }]}>
          <AppText variant="subheading" accessibilityRole="header">Gia đình gần đây</AppText>
          {families.error ? <ScreenState error={families.error} onRetry={() => void load()} /> : (
            <FlatList
              data={families.data?.items ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <FamilyRow family={item} onPress={() => onOpenFamily(item)} />}
              ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
              ListEmptyComponent={<AppText variant="caption">Chưa có gia đình</AppText>}
              scrollEnabled={false}
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

type FamilyRowProps = { family: AdminFamilySummary; onPress: () => void };

function FamilyRow({ family, onPress }: FamilyRowProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${family.name}, ${family.memberCount} thành viên`}
      accessibilityHint="Mở chi tiết gia đình"
      onPress={onPress}
      style={({ pressed }) => [local.familyRow, pressed && local.pressed]}
    >
      <AppIcon icon={House} size="md" color={colors.primary} />
      <View style={local.flex}>
        <AppText variant="body" numberOfLines={1}>{family.name}</AppText>
        <AppText variant="caption">{family.memberCount} thành viên</AppText>
      </View>
      <AppIcon icon={ChevronRight} size="sm" color={colors.muted} />
    </Pressable>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.lg },
  card: { gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  lists: { alignItems: "flex-start" },
  listCard: { gap: spacing.sm },
  familyRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: touchTarget, paddingVertical: spacing.sm },
  pressed: { backgroundColor: colors.primarySoft },
});
