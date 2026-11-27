import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { AppText, colors, radius, spacing } from "../../theme";
import { errorMessage } from "../notifications/gatewayApi";
import { useGatewayApi } from "../notifications/useGatewayApi";
import { ScreenState, styles, useLayout } from "../notifications/ui";
import { fetchFamily, type AdminFamilyDetail } from "./directoryApi";
import { ScreenHeader } from "./directoryUi";
import { familyDate } from "./familyView";

export interface AdminFamilyDetailScreenProps {
  familyId: string;
  /** Shown in the header while the detail loads. */
  familyName?: string;
  onBack: () => void;
}

/** One family: name, member count and created date only. No member names, emails or other member data. */
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
      </View>
      {loading && !family ? <ScreenState loading /> : error && !family ? (
        <ScreenState error={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} />
      ) : family ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: gutter }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
          <View style={local.card}>
            <Fact label="Tên gia đình" value={family.name} />
            <Fact label="Số thành viên" value={`${family.memberCount} thành viên`} divider />
            <Fact label="Ngày tạo" value={familyDate(family.createdAt)} divider />
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Fact({ label, value, divider }: { label: string; value: string; divider?: boolean }): React.JSX.Element {
  return (
    <View style={[local.fact, divider && local.divider]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="body" numberOfLines={2} style={local.value}>{value}</AppText>
    </View>
  );
}

const local = StyleSheet.create({
  top: { gap: spacing.xs, paddingTop: spacing.md },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  fact: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", paddingVertical: spacing.md },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  value: { flexShrink: 1, textAlign: "right" },
});
