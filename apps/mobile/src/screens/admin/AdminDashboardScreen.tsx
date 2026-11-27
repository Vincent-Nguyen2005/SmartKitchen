import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { House, Search, UserPlus, Users, type LucideIcon } from "lucide-react-native";
import { AppIcon, AppText, colors, spacing } from "../../theme";
import { loadAllPages } from "../../services/localSearch";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { ScreenState, styles, useLayout } from "../notifications/ui";
import { fetchFamilies, fetchUsers, MAX_PAGE_SIZE, type AdminFamilySummary, type AdminUser } from "./directoryApi";
import { directoryStyles, FamilyRow, UserRow } from "./directoryUi";
import { OVERVIEW_CARDS, overviewCardMemory, overviewCounts, overviewEmptyText, overviewList, searchPlaceholder, type OverviewCardKey } from "./overviewStats";

type Section<T> = { data: T[] | null; error: string | null };
const empty = <T,>(): Section<T> => ({ data: null, error: null });
const toSection = <T,>(result: PromiseSettledResult<T[]>): Section<T> =>
  result.status === "fulfilled" ? { data: result.value, error: null } : { data: null, error: errorMessage(result.reason) };

export interface AdminDashboardScreenProps {
  onOpenFamily: (family: AdminFamilySummary) => void;
}

const CARD_ICONS: Record<OverviewCardKey, LucideIcon> = { users: Users, families: House, newUsers: UserPlus };
type Row = { kind: "user"; user: AdminUser } | { kind: "family"; family: AdminFamilySummary };

/**
 * Admin landing page "Tổng quan": one card whose three cells (Người dùng, Gia đình, Mới (7 ngày)) are a selector
 * (choice kept for the admin session), then a search box (on the device, accent-insensitive) and one virtualized list
 * for the selected cell: all users / all families / users new in the last 7 Vietnam days, newest first. A family
 * opens its detail; user rows have no action. Every page of both lists is loaded once (pull to refresh).
 */
export default function AdminDashboardScreen({ onOpenFamily }: AdminDashboardScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [users, setUsers] = useState<Section<AdminUser>>(empty);
  const [families, setFamilies] = useState<Section<AdminFamilySummary>>(empty);
  const [card, setCardState] = useState<OverviewCardKey>(overviewCardMemory.get());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [usersResult, familiesResult] = await Promise.allSettled([
      loadAllPages((page) => fetchUsers(api, MAX_PAGE_SIZE, page)),
      loadAllPages((page) => fetchFamilies(api, MAX_PAGE_SIZE, page)),
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
  const retry = () => { setLoading(true); void load().finally(() => setLoading(false)); };
  const select = (next: OverviewCardKey) => { setCardState(overviewCardMemory.set(next)); setSearch(""); };

  const now = Date.now();
  const counts = useMemo(() => overviewCounts(users.data ?? [], families.data ?? [], now), [users.data, families.data, now]);
  const rows: Row[] = useMemo(() => {
    const list = overviewList(card, users.data ?? [], families.data ?? [], search, now);
    return list.kind === "families" ? list.items.map((family) => ({ kind: "family", family })) : list.items.map((user) => ({ kind: "user", user }));
  }, [card, users.data, families.data, search, now]);

  const nothingLoaded = !users.data && !families.data;
  if (loading && nothingLoaded) return <ScreenState loading />;
  if (nothingLoaded && users.error && families.error) return <ScreenState error={users.error} onRetry={retry} />;

  const source = card === "families" ? families : users;
  const header = (
    <View style={local.header}>
      {/* One card, three equal cells with thin dividers; the selected one is highlighted. */}
      <View accessibilityRole="tablist" style={[styles.card, local.statsCard]}>
        {OVERVIEW_CARDS.map((entry, index) => {
          const error = entry.key === "families" ? families.error : users.error;
          return (
            <StatCell key={entry.key} label={entry.label} spoken={entry.spoken} icon={CARD_ICONS[entry.key]} value={error ? "–" : String(counts[entry.key])}
              error={error} selected={card === entry.key} divider={index > 0} onPress={() => select(entry.key)} />
          );
        })}
      </View>
      <View style={[styles.input, styles.inputWithIcon]}>
        <AppIcon icon={Search} size="sm" color={colors.muted} />
        <TextInput accessibilityLabel={searchPlaceholder(card)} placeholder={searchPlaceholder(card)} placeholderTextColor={colors.muted} value={search} onChangeText={setSearch}
          autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" style={styles.inputBare} />
      </View>
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => (row.kind === "user" ? `u-${row.user.id}` : `f-${row.family.id}`)}
      renderItem={({ item }) => (item.kind === "user" ? <UserRow user={item.user} /> : <FamilyRow family={item.family} onPress={() => onOpenFamily(item.family)} />)}
      ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
      ListHeaderComponent={header}
      ListEmptyComponent={source.error
        ? <ScreenState error={source.error} onRetry={retry} />
        : <AppText variant="caption" style={local.empty}>{overviewEmptyText(card, search.trim().length > 0)}</AppText>}
      // Bottom padding: the last row ends above the bottom bar, never under it.
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: gutter + spacing.xl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      windowSize={10}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    />
  );
}

/** One cell of the overview card: icon and short label on one line, the number large below; pressing selects it. */
function StatCell({ label, spoken, icon, value, error, selected, divider, onPress }: {
  label: string; spoken: string; icon: LucideIcon; value: string; error: string | null; selected: boolean; divider: boolean; onPress: () => void;
}): React.JSX.Element {
  const color = error ? colors.muted : selected ? colors.primary : colors.text;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={error ? `${spoken}: không tải được` : `${spoken}: ${value}`} onPress={onPress}
      style={({ pressed }) => [local.cell, divider && local.cellDivider, selected && local.cellSelected, pressed && local.pressed]}>
      <View style={local.cellLabel}>
        <AppIcon icon={icon} size="sm" color={selected ? colors.primary : colors.muted} />
        <AppText variant="caption" numberOfLines={1} color={selected ? colors.primary : undefined} style={local.flexShrink}>{label}</AppText>
      </View>
      <AppText variant="heading" color={color} numberOfLines={1}>{value}</AppText>
    </Pressable>
  );
}

const local = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  statsCard: { flexDirection: "row", overflow: "hidden", padding: 0, paddingHorizontal: 0 },
  cell: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 3, flex: 1, gap: spacing.xs, minHeight: 44, minWidth: 0, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  cellDivider: { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth },
  cellSelected: { backgroundColor: colors.primarySoft, borderBottomColor: colors.primary },
  pressed: { opacity: 0.85 },
  cellLabel: { alignItems: "center", flexDirection: "row", gap: 4, maxWidth: "100%" },
  flexShrink: { flexShrink: 1 },
  empty: { paddingVertical: spacing.xl, textAlign: "center" },
});
