import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ChevronRight, House, UserPlus, Users, type LucideIcon } from "lucide-react-native";
import { AppIcon, AppText, colors, spacing } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { ScreenState, styles, useGridCell, useLayout } from "../notifications/ui";
import { fetchFamilies, fetchUsers, MAX_PAGE_SIZE, type AdminFamilySummary, type AdminUser } from "./directoryApi";
import { directoryStyles, FamilyRow, UserRow } from "./directoryUi";
import { countNewUsers, OVERVIEW_CARDS, type OverviewCardKey } from "./overviewStats";

type Section<T> = { data: T | null; error: string | null };
type Recent<T> = { items: T[]; total: number };

// The dashboard only previews the newest rows; "Xem tất cả" opens the full lists.
const RECENT_COUNT = 5;

const empty = <T,>(): Section<T> => ({ data: null, error: null });
const toSection = <T,>(result: PromiseSettledResult<T>): Section<T> =>
  result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };

export interface AdminDashboardScreenProps {
  onOpenUsers: () => void;
  onOpenFamilies: () => void;
  onOpenFamily: (family: AdminFamilySummary) => void;
}

type Card = { key: OverviewCardKey; label: string; value: string; icon: LucideIcon; error: string | null };
const CARD_ICONS: Record<OverviewCardKey, LucideIcon> = { users: Users, families: House, newUsers: UserPlus };

/**
 * Admin landing page "Tổng quan" (SCRUM-283): three cards (Tổng người dùng, Tổng gia đình, Người dùng mới (7 ngày))
 * in one row of equal height, then the newest users and families with "Xem tất cả".
 */
export default function AdminDashboardScreen({ onOpenUsers, onOpenFamilies, onOpenFamily }: AdminDashboardScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter, isWide } = useLayout();
  const listGrid = useGridCell(isWide ? 2 : 1);
  const [users, setUsers] = useState<Section<Recent<AdminUser>>>(empty);
  const [families, setFamilies] = useState<Section<Recent<AdminFamilySummary>>>(empty);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [usersResult, familiesResult] = await Promise.allSettled([
      // One newest-first page serves the total, the new-user count and the recent list.
      fetchUsers(api, MAX_PAGE_SIZE),
      fetchFamilies(api, RECENT_COUNT),
    ]);
    if (id !== requestId.current) return; // a newer refresh replaced this one
    setUsers(toSection(usersResult));
    setFamilies(toSection(familiesResult));
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

  const nothingLoaded = !users.data && !families.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && users.error && families.error) {
    return <ScreenState error={users.error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />;
  }

  const recentUsers = (users.data?.items ?? []).slice(0, RECENT_COUNT);
  const recentFamilies = (families.data?.items ?? []).slice(0, RECENT_COUNT);
  const values: Record<OverviewCardKey, { value: string; error: string | null }> = {
    users: { value: String(users.data?.total ?? "–"), error: users.error },
    families: { value: String(families.data?.total ?? "–"), error: families.error },
    newUsers: { value: users.data ? countNewUsers(users.data, Date.now()) : "–", error: users.error },
  };
  const cards: Card[] = OVERVIEW_CARDS.map((card) => ({ ...card, icon: CARD_ICONS[card.key], ...values[card.key] }));

  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      contentContainerStyle={[local.content, { padding: gutter }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      {/* One row, equal widths and heights (labels may take two lines, never cut). */}
      <View style={local.cardRow}>
        {cards.map((card) => <StatCard key={card.key} card={card} />)}
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

/** Icon, label (up to two lines), number. */
function StatCard({ card }: { card: Card }): React.JSX.Element {
  const color = card.error ? colors.muted : colors.primary;
  return (
    <View style={[styles.card, local.card]} accessible accessibilityLabel={card.error ? `${card.label}: không tải được` : `${card.label}: ${card.value}`}>
      <AppIcon icon={card.icon} size="sm" color={color} />
      <AppText variant="caption" numberOfLines={2} style={local.cardLabel}>{card.label}</AppText>
      <AppText variant="heading" color={color} numberOfLines={1}>{card.error ? "–" : card.value}</AppText>
    </View>
  );
}

const local = StyleSheet.create({
  content: { gap: spacing.md },
  cardRow: { flexDirection: "row", gap: spacing.sm },
  card: { flex: 1, gap: spacing.xs, minWidth: 0 },
  // Two lines reserved, so the three cards keep the same height whatever the label length.
  cardLabel: { minHeight: 32 },
  flex: { flex: 1, minWidth: 0 },
  lists: { alignItems: "flex-start" },
  listCard: { gap: spacing.sm },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, minHeight: 44 },
  // Text link with a 44 dp touch target.
  link: { alignItems: "center", flexDirection: "row", gap: 2, justifyContent: "flex-end", minHeight: 44, paddingLeft: spacing.sm },
  linkPressed: { opacity: 0.6 },
});
