import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { FamilyMemberSummary, FamilyRole } from "./FamilyOverviewScreen";

type Props = {
  members: FamilyMemberSummary[];
  currentUserRole: FamilyRole;
  currentUserId: string;
  onChangeRole?: (memberId: string, role: Exclude<FamilyRole, "OWNER">) => Promise<void>;
  onRemove?: (memberId: string) => Promise<void>;
  onTransferOwnership?: (memberId: string) => Promise<void>;
  onBack?: () => void;
};

export default function ManageMembersScreen({ members, currentUserRole, currentUserId, onChangeRole, onRemove, onTransferOwnership, onBack }: Props): React.JSX.Element {
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const isOwner = currentUserRole === "OWNER";
  const transferTarget = members.find((member) => member.id === transferTargetId);

  const changeRole = async (member: FamilyMemberSummary): Promise<void> => {
    if (!onChangeRole || member.role === "OWNER") return;
    const nextRole: Exclude<FamilyRole, "OWNER"> = member.role === "ADMIN" ? "MEMBER" : "ADMIN";
    if (!isOwner && nextRole === "ADMIN") return;
    setBusyMemberId(member.id); setError("");
    try { await onChangeRole(member.id, nextRole); }
    catch { setError("Could not update this member. Please try again."); }
    finally { setBusyMemberId(null); }
  };

  const remove = (member: FamilyMemberSummary): void => {
    if (!onRemove || member.role === "OWNER" || (member.role === "ADMIN" && !isOwner) || member.userId === currentUserId) return;
    Alert.alert("Remove family member?", `Remove ${member.displayName || member.email || "this person"} from the family?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { void removeMember(member); } },
    ]);
  };

  const removeMember = async (member: FamilyMemberSummary): Promise<void> => {
    if (!onRemove) return;
    setBusyMemberId(member.id); setError("");
    try { await onRemove(member.id); }
    catch { setError("Could not remove this member. Please try again."); }
    finally { setBusyMemberId(null); }
  };

  const transferOwnership = async (): Promise<void> => {
    if (!onTransferOwnership || !transferTarget) return;
    setBusyMemberId(transferTarget.id); setError("");
    try {
      await onTransferOwnership(transferTarget.id);
      setTransferModalOpen(false);
      setTransferTargetId(null);
    } catch {
      setError("Could not transfer ownership. Please try again.");
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {!!onBack && <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.link}>‹  Family</Text></Pressable>}
        <Text style={styles.eyebrow}>HOUSEHOLD ACCESS</Text>
        <Text style={styles.title}>Manage members</Text>
        <Text style={styles.subtitle}>Choose who can help manage your shared family space.</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.card}>
          {members.map((member, index) => {
            const isSelf = member.userId === currentUserId;
            const canManageTarget = member.role !== "OWNER" && (isOwner || (currentUserRole === "ADMIN" && member.role === "MEMBER")) && !isSelf;
            const isBusy = busyMemberId === member.id;
            return (
              <View key={member.id} style={[styles.member, index > 0 && styles.divider]}>
                <View style={styles.memberTop}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(member.displayName || member.email || "?").trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.displayName || member.email || `Member ${member.userId.slice(0, 8)}`}{isSelf ? " (You)" : ""}</Text>
                    <View style={[styles.badge, member.role === "OWNER" && styles.ownerBadge]}><Text style={[styles.badgeText, member.role === "OWNER" && styles.ownerText]}>{member.role === "OWNER" ? "Owner" : member.role === "ADMIN" ? "Admin" : "Member"}</Text></View>
                  </View>
                  {isBusy && <ActivityIndicator color="#2F6B5F" />}
                </View>
                {canManageTarget && <View style={styles.actions}>
                  {isOwner && !!onChangeRole && <Pressable disabled={isBusy} onPress={() => { void changeRole(member); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>{member.role === "ADMIN" ? "Make member" : "Make admin"}</Text></Pressable>}
                  {!!onRemove && <Pressable disabled={isBusy} onPress={() => remove(member)} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable>}
                </View>}
              </View>
            );
          })}
        </View>
        {isOwner && !!onTransferOwnership && <Pressable onPress={() => setTransferModalOpen(true)} style={styles.transferButton}>
          <Text style={styles.transferText}>Transfer ownership</Text>
        </Pressable>}
        <Text style={styles.note}>{isOwner ? "Only the owner can assign admin access. The owner role cannot be removed here." : "Admins can manage members, but only the owner can assign admin access."}</Text>
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setTransferModalOpen(false)} transparent visible={transferModalOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transfer family ownership</Text>
            <Text style={styles.modalCopy}>Choose a family member to become the new owner. You will become an admin.</Text>
            <ScrollView style={styles.modalList}>
              {members.filter((member) => member.userId !== currentUserId && member.role !== "OWNER").map((member) => {
                const selected = transferTargetId === member.id;
                return <Pressable key={member.id} onPress={() => setTransferTargetId(member.id)} style={styles.targetRow}>
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <View style={styles.targetInfo}>
                    <Text style={styles.targetName}>{member.displayName || member.email || `Member ${member.userId.slice(0, 8)}`}</Text>
                    <Text style={styles.targetRole}>{member.role === "ADMIN" ? "Admin" : "Member"}</Text>
                  </View>
                </Pressable>;
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setTransferModalOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable disabled={!transferTarget || busyMemberId !== null} onPress={() => { void transferOwnership(); }} style={[styles.confirmButton, (!transferTarget || busyMemberId !== null) && styles.disabled]}>
                {busyMemberId === transferTarget?.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Transfer</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  content: { padding: 24, paddingBottom: 40 },
  backButton: { alignSelf: "flex-start", marginBottom: 24, paddingVertical: 6 },
  link: { color: "#2F6B5F", fontSize: 15, fontWeight: "700" },
  eyebrow: { color: "#2F6B5F", fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: "#17211F", fontSize: 30, fontWeight: "700", marginTop: 8 },
  subtitle: { color: "#68736F", fontSize: 15, lineHeight: 22, marginBottom: 22, marginTop: 8 },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 14, padding: 12 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  member: { paddingBottom: 16, paddingTop: 16 },
  divider: { borderTopColor: "#EDF0ED", borderTopWidth: 1 },
  memberTop: { alignItems: "center", flexDirection: "row" },
  avatar: { alignItems: "center", backgroundColor: "#E4F0E9", borderRadius: 20, height: 40, justifyContent: "center", marginRight: 12, width: 40 },
  avatarText: { color: "#2F6B5F", fontSize: 16, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberName: { color: "#17211F", fontSize: 15, fontWeight: "600", marginBottom: 6 },
  badge: { alignSelf: "flex-start", backgroundColor: "#EFF2EF", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 },
  ownerBadge: { backgroundColor: "#FFF2CC" },
  badgeText: { color: "#56635C", fontSize: 11, fontWeight: "700" },
  ownerText: { color: "#8A5A00" },
  actions: { flexDirection: "row", gap: 9, marginLeft: 52, marginTop: 13 },
  secondaryButton: { borderColor: "#C8DAD0", borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryText: { color: "#2F6B5F", fontSize: 12, fontWeight: "700" },
  removeButton: { borderColor: "#F2C6C3", borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  removeText: { color: "#B42318", fontSize: 12, fontWeight: "700" },
  transferButton: { alignItems: "center", borderColor: "#F2C6C3", borderRadius: 11, borderWidth: 1, marginTop: 18, minHeight: 48, justifyContent: "center" },
  transferText: { color: "#B42318", fontSize: 14, fontWeight: "700" },
  note: { color: "#7A8580", fontSize: 13, lineHeight: 19, marginTop: 16 },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", flex: 1, justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, maxHeight: "80%", padding: 20, width: "100%" },
  modalTitle: { color: "#17211F", fontSize: 20, fontWeight: "700" },
  modalCopy: { color: "#68736F", fontSize: 14, lineHeight: 20, marginTop: 8 },
  modalList: { marginTop: 12 },
  targetRow: { alignItems: "center", borderTopColor: "#EDF0ED", borderTopWidth: 1, flexDirection: "row", minHeight: 58, paddingVertical: 10 },
  radio: { borderColor: "#9AA69F", borderRadius: 9, borderWidth: 1.5, height: 18, marginRight: 12, width: 18 },
  radioSelected: { backgroundColor: "#2F6B5F", borderColor: "#2F6B5F" },
  targetInfo: { flex: 1 },
  targetName: { color: "#17211F", fontSize: 14, fontWeight: "600" },
  targetRole: { color: "#7A8580", fontSize: 12, marginTop: 3 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  cancelButton: { borderColor: "#D7E0D9", borderRadius: 9, borderWidth: 1, justifyContent: "center", paddingHorizontal: 16, minHeight: 42 },
  cancelText: { color: "#56635C", fontSize: 13, fontWeight: "700" },
  confirmButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 9, justifyContent: "center", minHeight: 42, minWidth: 88, paddingHorizontal: 16 },
  confirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});