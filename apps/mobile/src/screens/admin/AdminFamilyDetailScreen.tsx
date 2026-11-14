import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { AppText, colors, spacing } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { ScreenState, styles, useLayout } from "../notifications/ui";
import { displayName, familyRoleText, fetchFamily, formatDate, type AdminFamilyDetail, type AdminFamilyMember } from "./directoryApi";
import { Avatar, directoryStyles, ScreenHeader } from "./directoryUi";

export interface AdminFamilyDetailScreenProps {
  familyId: string;
  /** Shown in the header while the detail loads. */
  familyName?: string;
  onBack: () => void;
}

/** One family: name, creation date and members (SCRUM-283). */
export default function AdminFamilyDetailScreen({ familyId, familyName, onBack }: AdminFamilyDetailScreenProps): React.JSX.Element {
  const { api } = useGatewayApi();
  const { gutter } = useLayout();
  const [family, setFamily] = useState<AdminFamilyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fetchFamily(api, familyId);
      if (id !== requestId.current) return;
      setFamily(result);
      setError(null);
    } catch (caught) {
      if (id === requestId.current) setError(errorMessage(caught));
    }
  }, [api, familyId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const title = family?.name ?? familyName ?? "Gia đình";

  return (
    <View style={styles.screen}>
      <View style={[local.top, { paddingHorizontal: gutter }]}>
        <ScreenHeader title={title} onBack={onBack} />
        {family ? (
          <AppText variant="caption">
            Tạo ngày {formatDate(family.createdAt)} · {family.memberCount} thành viên
            {family.ownerEmail ? ` · Chủ: ${family.ownerEmail}` : ""}
          </AppText>
        ) : null}
      </View>
      {loading && !family ? <ScreenState loading /> : error && !family ? (
        <ScreenState error={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />
      ) : (
        <FlatList
          data={family?.members ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MemberRow member={item} />}
          ItemSeparatorComponent={() => <View style={directoryStyles.separator} />}
          ListHeaderComponent={<AppText variant="subheading" accessibilityRole="header" style={local.listTitle}>Thành viên</AppText>}
          ListEmptyComponent={<AppText variant="caption">Chưa có thành viên</AppText>}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: gutter }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

type MemberRowProps = { member: AdminFamilyMember };

function MemberRow({ member }: MemberRowProps): React.JSX.Element {
  const name = displayName(member);
  const role = familyRoleText[member.role] ?? member.role;
  const joined = member.joinedAt ? `Tham gia ${formatDate(member.joinedAt)}` : null;
  return (
    <View style={local.row} accessible accessibilityLabel={[name, role, joined].filter(Boolean).join(", ")}>
      <Avatar name={member.name} email={member.email} />
      <View style={local.flex}>
        <AppText variant="body" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption">{role}</AppText>
        {joined ? <AppText variant="caption">{joined}</AppText> : null}
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  top: { gap: spacing.xs, paddingTop: spacing.md },
  listTitle: { paddingVertical: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  row: { alignItems: "center", flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
});
