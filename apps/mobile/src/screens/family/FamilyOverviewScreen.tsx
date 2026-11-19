import React, { useState } from "react";
import { RefreshCw } from "lucide-react-native";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import MemberAvatar from "./MemberAvatar";
import { colors, typography } from "../../theme";

export type FamilyRole = "OWNER" | "ADMIN" | "MEMBER";
export type FamilyMemberSummary = { id: string; userId: string; role: FamilyRole; joinedAt?: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null };
export type FamilySummary = { id: string; name: string; code: string; members: FamilyMemberSummary[]; currentUserRole?: FamilyRole };

type Props = {
  family?: FamilySummary | null;
  loading?: boolean;
  error?: string;
  onCreateOrJoin?: () => void;
  onManageMembers?: () => void;
  onManageSettings?: () => void;
  onLeave?: () => Promise<void>;
  onRegenerateJoinCode?: () => Promise<void>;
};

const roleLabel: Record<FamilyRole, string> = { OWNER: "Chủ gia đình", ADMIN: "Quản trị viên", MEMBER: "Thành viên" };

export default function FamilyOverviewScreen({ family, loading = false, error, onCreateOrJoin, onManageMembers, onManageSettings, onLeave, onRegenerateJoinCode }: Props): React.JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [actionError, setActionError] = useState("");
  const canManage = family?.currentUserRole === "OWNER" || family?.currentUserRole === "ADMIN";

  const leave = async (): Promise<void> => {
    if (!onLeave || family?.currentUserRole === "OWNER") return;
    setLeaving(true);
    try { await onLeave(); setActionError(""); }
    catch { setActionError("Không thể rời gia đình. Vui lòng thử lại."); }
    finally { setLeaving(false); }
  };

  const regenerateCode = async (): Promise<void> => {
    if (!onRegenerateJoinCode) return;
    setRegenerating(true);
    try { await onRegenerateJoinCode(); setActionError(""); }
    catch { setActionError("Không thể tạo mã mời mới. Vui lòng thử lại."); }
    finally { setRegenerating(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!!actionError && <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>}
        {loading ? <ActivityIndicator color="#2F6B5F" size="large" style={styles.loader} /> : family ? (
          <>
            <View style={styles.hero}>
              <View pointerEvents="none" style={styles.cardCircleLarge} />
              <View pointerEvents="none" style={styles.cardCircleSmall} />
              <View style={styles.cardHeader}>
                <Text style={styles.cardBrand}>SMARTKITCHEN</Text>
                <Text style={styles.cardType}>THẺ GIA ĐÌNH</Text>
              </View>
              <View style={styles.chip}>
                <View style={styles.chipLineHorizontal} />
                <View style={styles.chipLineVertical} />
              </View>
              <View>
                <View style={styles.codeLabelRow}>
                  <Text style={styles.codeLabel}>MÃ MỜI GIA ĐÌNH</Text>
                  {canManage && !!onRegenerateJoinCode && (
                    <Pressable
                      accessibilityLabel="Tạo mã mời mới"
                      accessibilityRole="button"
                      disabled={regenerating}
                      onPress={() => { void regenerateCode(); }}
                      style={styles.regenerateIconButton}
                    >
                      {regenerating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <RefreshCw color="#FFFFFF" size={19} />}
                    </Pressable>
                  )}
                </View>
                <Text selectable style={styles.code}>{family.code}</Text>
              </View>
              <View style={styles.cardFooter}>
                <View style={styles.cardFooterName}>
                  <Text style={styles.cardFooterLabel}>TÊN GIA ĐÌNH</Text>
                  <Text numberOfLines={1} style={styles.familyName}>{family.name}</Text>
                </View>
                <View>
                  <Text style={styles.cardFooterLabel}>THÀNH VIÊN</Text>
                  <Text style={styles.memberCount}>{family.members.length} người</Text>
                </View>
              </View>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Thành viên</Text>
              {canManage && <Pressable onPress={onManageMembers}><Text style={styles.actionLink}>Quản lý</Text></Pressable>}
            </View>
            <View style={styles.card}>
              {family.members.map((member, index) => (
                <View key={member.id} style={[styles.memberRow, index > 0 && styles.memberDivider]}>
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.displayName?.trim() || "Chưa có tên"}</Text>
                  </View>
                  <View style={[styles.badge, member.role === "OWNER" && styles.ownerBadge]}><Text style={[styles.badgeText, member.role === "OWNER" && styles.ownerBadgeText]}>{roleLabel[member.role]}</Text></View>
                </View>
              ))}
            </View>
            {canManage && !!onManageSettings && <Pressable onPress={onManageSettings} style={styles.settingsButton}>
              <Text style={styles.actionLink}>Tùy chọn và cài đặt gia đình</Text>
            </Pressable>}
            {family.currentUserRole !== "OWNER" && (
              <Pressable disabled={!onLeave || leaving} onPress={leave} style={styles.leaveButton}>
                {leaving ? <ActivityIndicator color="#B42318" /> : <Text style={styles.leaveText}>Rời gia đình</Text>}
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Bắt đầu tạo gia đình</Text>
            <Text style={styles.emptyCopy}>Tạo gia đình mới hoặc tham gia bằng mã mời.</Text>
            <Pressable onPress={onCreateOrJoin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Tạo hoặc tham gia gia đình</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  content: { alignSelf: "center", maxWidth: 720, padding: 24, paddingBottom: 36, width: "100%" },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 16, padding: 12 },
  loader: { marginTop: 48 },
  hero: { backgroundColor: "#174F49", borderRadius: 20, justifyContent: "space-between", minHeight: 230, overflow: "hidden", padding: 22 },
  cardCircleLarge: { borderColor: "rgba(255,255,255,0.12)", borderRadius: 130, borderWidth: 42, height: 260, position: "absolute", right: -72, top: -105, width: 260 },
  cardCircleSmall: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 80, bottom: -92, height: 160, position: "absolute", right: 38, width: 160 },
  cardHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardBrand: { color: "#FFFFFF", fontSize: typography.bodySmall.fontSize, fontWeight: "800", letterSpacing: 1 },
  cardType: { color: "#D9E9E2", fontSize: typography.caption.fontSize, fontWeight: "700" },
  chip: { backgroundColor: "#D9E6D7", borderColor: "#F4F6E9", borderRadius: 6, borderWidth: 1, height: 27, overflow: "hidden", width: 36 },
  chipLineHorizontal: { borderTopColor: "#A7BDB1", borderTopWidth: 1, left: 0, position: "absolute", right: 0, top: 12 },
  chipLineVertical: { borderLeftColor: "#A7BDB1", borderLeftWidth: 1, bottom: 0, left: 17, position: "absolute", top: 0 },
  codeLabelRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  codeLabel: { color: "#D9E9E2", fontSize: typography.caption.fontSize, fontWeight: "700", letterSpacing: 1.1 },
  regenerateIconButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  code: { color: "#FFFFFF", fontSize: typography.heading.fontSize, fontWeight: "800", letterSpacing: 3, marginTop: 4 },
  cardFooter: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cardFooterName: { flex: 1 },
  cardFooterLabel: { color: "#D9E9E2", fontSize: typography.caption.fontSize, fontWeight: "700", marginBottom: 4 },
  familyName: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  memberCount: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
  sectionHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, marginTop: 24 },
  sectionTitle: { color: "#17211F", fontSize: typography.subheading.fontSize, fontWeight: "700" },
  actionLink: { color: "#2F6B5F", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  memberRow: { alignItems: "center", flexDirection: "row", minHeight: 72, paddingVertical: 12 },
  memberDivider: { borderTopColor: "#EDF0ED", borderTopWidth: 1 },
  memberInfo: { flex: 1 },
  memberName: { color: "#17211F", fontSize: typography.body.fontSize, fontWeight: "600" },
  badge: { backgroundColor: "#EFF2EF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  ownerBadge: { backgroundColor: "#FFF2CC" },
  badgeText: { ...typography.caption, color: "#56635C", fontWeight: "700" },
  ownerBadgeText: { color: "#8A5A00" },
  leaveButton: { alignItems: "center", borderColor: "#F2C6C3", borderRadius: 12, borderWidth: 1, marginTop: 22, minHeight: 48, justifyContent: "center" },
  leaveText: { color: "#B42318", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  settingsButton: { alignItems: "center", borderColor: "#C8DAD0", borderRadius: 12, borderWidth: 1, marginTop: 16, minHeight: 48, justifyContent: "center" },
  emptyCard: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 24 },
  emptyTitle: { color: "#17211F", fontSize: typography.subheading.fontSize, fontWeight: "700", textAlign: "center" },
  emptyCopy: { color: "#68736F", fontSize: typography.bodySmall.fontSize, lineHeight: 21, marginTop: 9, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, marginTop: 22, minHeight: 50, justifyContent: "center", paddingHorizontal: 20, width: "100%" },
  primaryButtonText: { color: "#FFFFFF", fontSize: typography.body.fontSize, fontWeight: "700" },
});
