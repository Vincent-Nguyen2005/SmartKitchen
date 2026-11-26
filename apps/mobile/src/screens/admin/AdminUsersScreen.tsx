import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { normalizeVi } from "../../services/localSearch";
import { Search } from "lucide-react-native";
import { AppText, colors, spacing } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { Field, ScreenState, styles, useLayout } from "../notifications/ui";
import { fetchUsers, MAX_PAGE_SIZE, type AdminUser } from "./directoryApi";
import { directoryStyles, ScreenHeader, UserRow } from "./directoryUi";

export interface AdminUsersScreenProps {
  onBack: () => void;
}

/** Name or email contains the typed text, case- and accent-insensitive ("nguyen" finds "Nguyễn"). */
const matches = (user: AdminUser, needle: string): boolean =>
  normalizeVi(user.name ?? "").includes(needle) || normalizeVi(user.email).includes(needle);

/** All users (newest first), filtered client-side by name or email (SCRUM-283). */
export default function AdminUsersScreen({ onBack }: AdminUsersScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const page = await fetchUsers(api, MAX_PAGE_SIZE);
      if (id !== requestId.current) return;
      setUsers(page.items);
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

  const needle = normalizeVi(search);
  const visible = useMemo(() => (needle ? users.filter((user) => matches(user, needle)) : users), [needle, users]);

  return (
    <View style={styles.screen}>
      <View style={[local.top, { paddingHorizontal: gutter }]}>
        <ScreenHeader title="Người dùng" onBack={onBack} />
        <Field
          label="Tìm theo tên hoặc email"
          icon={Search}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {total > users.length ? (
          <AppText variant="caption">Đang hiển thị {users.length}/{total} người dùng mới nhất.</AppText>
        ) : null}
      </View>
      {loading && users.length === 0 ? <ScreenState loading /> : error && users.length === 0 ? (
        <ScreenState error={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />
      ) : (
        <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserRow user={item} />}
          ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
          ListEmptyComponent={<AppText variant="caption" style={local.empty}>Chưa có người dùng</AppText>}
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
