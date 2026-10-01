import React, { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export type FamilyRole = "OWNER" | "ADMIN" | "MEMBER";
export type FamilyMemberSummary = { id: string; userId: string; role: FamilyRole; joinedAt?: string; displayName?: string; email?: string };
export type FamilySummary = { id: string; name: string; code: string; members: FamilyMemberSummary[]; currentUserRole?: FamilyRole };

type Props = {
  family?: FamilySummary | null;
  loading?: boolean;
  error?: string;
  onRefresh?: () => Promise<void> | void;
  onCreateOrJoin?: () => void;
  onManageMembers?: () => void;
  onLeave?: () => Promise<void>;
};

const roleLabel: Record<FamilyRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export default function FamilyOverviewScreen({ family, loading = false, error, onRefresh, onCreateOrJoin, onManageMembers, onLeave }: Props): React.JSX.Element {
  const [leaving, setLeaving] = useState(false);
  const canManage = family?.currentUserRole === "OWNER" || family?.currentUserRole === "ADMIN";

  const leave = async (): Promise<void> => {
    if (!onLeave || family?.currentUserRole === "OWNER") return;
    setLeaving(true);
    try { await onLeave(); } finally { setLeaving(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR HOUSEHOLD</Text>
        <Text style={styles.title}>Family</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {loading ? <ActivityIndicator color="#2F6B5F" size="large" style={styles.loader} /> : family ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.familyName}>{family.name}</Text>
              <Text style={styles.memberCount}>{family.members.length} {family.members.length === 1 ? "member" : "members"}</Text>
              <Text style={styles.codeLabel}>INVITE CODE</Text>
              <Text selectable style={styles.code}>{family.code}</Text>
              <Text style={styles.codeHint}>Share this code with people you want to invite.</Text>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Members</Text>
              {canManage && <Pressable onPress={onManageMembers}><Text style={styles.actionLink}>Manage</Text></Pressable>}
            </View>
            <View style={styles.card}>
              {family.members.map((member, index) => (
                <View key={member.id} style={[styles.memberRow, index > 0 && styles.memberDivider]}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(member.displayName || member.email || "?").trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.displayName || member.email || `Member ${member.userId.slice(0, 8)}`}</Text>
                    {!!member.email && !!member.displayName && <Text style={styles.memberEmail}>{member.email}</Text>}
                  </View>
                  <View style={[styles.badge, member.role === "OWNER" && styles.ownerBadge]}><Text style={[styles.badgeText, member.role === "OWNER" && styles.ownerBadgeText]}>{roleLabel[member.role]}</Text></View>
                </View>
              ))}
            </View>
            {family.currentUserRole === "OWNER" ? <Text style={styles.ownerNote}>As the owner, transfer ownership before leaving this family.</Text> : (
              <Pressable disabled={!onLeave || leaving} onPress={leave} style={styles.leaveButton}>
                {leaving ? <ActivityIndicator color="#B42318" /> : <Text style={styles.leaveText}>Leave family</Text>}
              </Pressable>
            )}
            {!!onRefresh && <Pressable onPress={onRefresh} style={styles.refreshButton}><Text style={styles.actionLink}>Refresh family details</Text></Pressable>}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your household starts here</Text>
            <Text style={styles.emptyCopy}>Create a family space or join one with an invite code.</Text>
            <Pressable onPress={onCreateOrJoin} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create or join a family</Text></Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F8F4" },
  content: { padding: 24, paddingBottom: 36 },
  eyebrow: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.3, marginTop: 12 },
  title: { color: "#17211F", fontSize: 32, fontWeight: "700", marginBottom: 22, marginTop: 6 },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 16, padding: 12 },
  loader: { marginTop: 48 },
  hero: { backgroundColor: "#2F6B5F", borderRadius: 20, marginBottom: 26, padding: 22 },
  familyName: { color: "#FFFFFF", fontSize: 25, fontWeight: "700" },
  memberCount: { color: "#D9E9E2", fontSize: 14, marginTop: 5 },
  codeLabel: { color: "#D9E9E2", fontSize: 11, fontWeight: "700", letterSpacing: 1.1, marginTop: 24 },
  code: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", letterSpacing: 3, marginTop: 5 },
  codeHint: { color: "#D9E9E2", fontSize: 13, marginTop: 5 },
  sectionHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: "#17211F", fontSize: 19, fontWeight: "700" },
  actionLink: { color: "#2F6B5F", fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  memberRow: { alignItems: "center", flexDirection: "row", minHeight: 72, paddingVertical: 12 },
  memberDivider: { borderTopColor: "#EDF0ED", borderTopWidth: 1 },
  avatar: { alignItems: "center", backgroundColor: "#E4F0E9", borderRadius: 20, height: 40, justifyContent: "center", marginRight: 12, width: 40 },
  avatarText: { color: "#2F6B5F", fontSize: 16, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { color: "#17211F", fontSize: 15, fontWeight: "600" },
  memberEmail: { color: "#7A8580", fontSize: 12, marginTop: 3 },
  badge: { backgroundColor: "#EFF2EF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  ownerBadge: { backgroundColor: "#FFF2CC" },
  badgeText: { color: "#56635C", fontSize: 11, fontWeight: "700" },
  ownerBadgeText: { color: "#8A5A00" },
  ownerNote: { color: "#68736F", fontSize: 13, lineHeight: 20, marginTop: 20, textAlign: "center" },
  leaveButton: { alignItems: "center", borderColor: "#F2C6C3", borderRadius: 12, borderWidth: 1, marginTop: 22, minHeight: 48, justifyContent: "center" },
  leaveText: { color: "#B42318", fontSize: 14, fontWeight: "700" },
  refreshButton: { alignItems: "center", padding: 18 },
  emptyCard: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 24 },
  emptyTitle: { color: "#17211F", fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyCopy: { color: "#68736F", fontSize: 14, lineHeight: 21, marginTop: 9, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 12, marginTop: 22, minHeight: 50, justifyContent: "center", paddingHorizontal: 20, width: "100%" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});