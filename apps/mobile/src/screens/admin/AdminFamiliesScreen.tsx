import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Search } from "lucide-react-native";
import { AppText, colors, spacing } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Field, ScreenState, styles, useLayout } from "../notifications/ui";
import { fetchFamilies, MAX_PAGE_SIZE, type AdminFamilySummary } from "./directoryApi";
import { directoryStyles, FamilyRow, ScreenHeader } from "./directoryUi";

export interface AdminFamiliesScreenProps {
  onBack: () => void;
  onOpenFamily: (family: AdminFamilySummary) => void;
}

/** All families (newest first), filtered client-side by name; a row opens the family detail. */
export default function AdminFamiliesScreen({ onBack, onOpenFamily }: AdminFamiliesScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [families, setFamilies] = useState<AdminFamilySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const page = await fetchFamilies(api, MAX_PAGE_SIZE);
      if (id !== requestId.current) return;
      setFamilies(page.items);
      setTotal(page.total);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    }
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

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? families.filter((family) => family.name.toLowerCase().includes(needle)) : families),
    [families, needle],
  );

  return (
    <View style={styles.screen}>
      <View style={[local.top, { paddingHorizontal: gutter }]}>
        <ScreenHeader title="Gia đình" onBack={onBack} />
        <Field
          label="Tìm theo tên gia đình"
          icon={Search}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {total > families.length ? (
          <AppText variant="caption">Đang hiển thị {families.length}/{total} gia đình mới nhất.</AppText>
        ) : null}
      </View>
      {loading && families.length === 0 ? <ScreenState loading /> : error && families.length === 0 ? (
        <ScreenState error={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />
      ) : (
        <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FamilyRow family={item} onPress={() => onOpenFamily(item)} />}
          ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
          ListEmptyComponent={<AppText variant="caption" style={local.empty}>{needle ? "Không tìm thấy gia đình" : "Chưa có gia đình"}</AppText>}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: gutter }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const local = StyleSheet.create({
  top: { gap: spacing.xs, paddingTop: spacing.md },
  empty: { paddingVertical: spacing.xl, textAlign: "center" },
});
