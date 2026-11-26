import React, { useState } from "react";
import { ArrowLeft } from "lucide-react-native";
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { FamilyMemberSummary, FamilyRole } from "./FamilyOverviewScreen";
import { AppIcon, colors, typography } from "../../theme";
import MemberAvatar from "./MemberAvatar";
import { useConfirm } from "../../components/ConfirmDialog";
import { canRemoveMember, familyRoleLabel, isFamilyOwner, removeConfirm, transferConfirm } from "./familyActions";

type Props = {
  members: FamilyMemberSummary[];
  currentUserRole: FamilyRole;
  currentUserId: string;
  onRemove?: (memberId: string) => Promise<void>;
  onTransferOwnership?: (memberId: string) => Promise<void>;
  onBack?: () => void;
};

/**
 * "Quản lý thành viên": family roles are only the owner and members. Each row: avatar, name (one line, ellipsis) with
 * the role badge under it, and for the owner a small "Xóa" button on the right of the same row (never on the owner's
 * or one's own row). Removing and transferring ownership (pick a member, then confirm) use the in-app ConfirmDialog.
 */
export default function ManageMembersScreen({ members, currentUserRole, currentUserId, onRemove, onTransferOwnership, onBack }: Props): React.JSX.Element {
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const isOwner = isFamilyOwner(currentUserRole);
  const transferTarget = members.find((member) => member.id === transferTargetId);
  const transferCandidates = members.filter((member) => member.userId !== currentUserId && member.role !== "OWNER");

  const remove = async (member: FamilyMemberSummary): Promise<void> => {
    if (!onRemove || !canRemoveMember(member, currentUserRole, currentUserId)) return;
    if (!(await confirm(removeConfirm(member.displayName)))) return;
    setBusyMemberId(member.id); setError("");
    try { await onRemove(member.id); }
    catch { setError("Không thể xóa thành viên. Vui lòng thử lại."); }
    finally { setBusyMemberId(null); }
  };

  // The picker is a Modal and the ConfirmDialog an overlay of this screen: close the picker before asking.
  const transferOwnership = async (): Promise<void> => {
    if (!onTransferOwnership || !transferTarget) return;
    const target = transferTarget;
    setTransferModalOpen(false);
    if (!(await confirm(transferConfirm(target.displayName)))) return;
    setBusyMemberId(target.id); setError("");
    try {
      await onTransferOwnership(target.id);
      setTransferTargetId(null);
    } catch {
      setError("Không thể chuyển quyền chủ gia đình. Vui lòng thử lại.");
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!!onBack && <Pressable accessibilityRole="button" accessibilityLabel="Quay lại gia đình" onPress={onBack} style={styles.backButton}><AppIcon icon={ArrowLeft} color={colors.primary} /><Text style={styles.link}>Gia đình</Text></Pressable>}
        <Text style={styles.title}>Quản lý thành viên</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.card}>
          {members.map((member, index) => {
            const isSelf = member.userId === currentUserId;
            const displayName = member.displayName?.trim() || (isSelf ? "Chưa cập nhật" : "Chưa có tên");
            const canManageTarget = canRemoveMember(member, currentUserRole, currentUserId);
            const isBusy = busyMemberId === member.id;
            return (
              <View key={member.id} style={[styles.member, index > 0 && styles.divider]}>
                <View style={styles.memberTop}>
                  <MemberAvatar name={displayName} avatarUrl={member.avatarUrl} />
                  <View style={styles.memberInfo}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.memberName}>{displayName}</Text>
                    <View style={[styles.badge, member.role === "OWNER" && styles.ownerBadge]}><Text style={[styles.badgeText, member.role === "OWNER" && styles.ownerText]}>{familyRoleLabel(member.role)}</Text></View>
                  </View>
                  {isBusy ? <ActivityIndicator color="#2F6B5F" style={styles.rowAction} /> : canManageTarget && !!onRemove ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${displayName} khỏi gia đình`} onPress={() => { void remove(member); }} style={[styles.removeButton, styles.rowAction]}><Text style={styles.removeText}>Xóa</Text></Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        {isOwner && !!onTransferOwnership && transferCandidates.length > 0 && <Pressable onPress={() => setTransferModalOpen(true)} style={styles.transferButton}>
          <Text style={styles.transferText}>Chuyển quyền chủ gia đình</Text>
        </Pressable>}
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setTransferModalOpen(false)} transparent visible={transferModalOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chuyển quyền chủ gia đình</Text>
            <Text style={styles.modalCopy}>Chọn người nhận quyền. Bạn sẽ trở thành thành viên.</Text>
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.modalList}>
              {transferCandidates.map((member) => {
                const selected = transferTargetId === member.id;
                return <Pressable key={member.id} onPress={() => setTransferTargetId(member.id)} style={styles.targetRow}>
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <View style={styles.targetInfo}>
                    <Text style={styles.targetName}>{member.displayName?.trim() || "Chưa có tên"}</Text>
                    <Text style={styles.targetRole}>{familyRoleLabel(member.role)}</Text>
                  </View>
                </Pressable>;
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setTransferModalOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Hủy</Text></Pressable>
              <Pressable disabled={!transferTarget || busyMemberId !== null} onPress={() => { void transferOwnership(); }} style={[styles.confirmButton, (!transferTarget || busyMemberId !== null) && styles.disabled]}>
                <Text style={styles.confirmText}>Tiếp tục</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7F8F4", flex: 1 },
  content: { alignSelf: "center", maxWidth: 720, padding: 24, paddingBottom: 120, width: "100%" },
  backButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 8, marginBottom: 12, minHeight: 44 },
  link: { color: "#2F6B5F", fontSize: typography.body.fontSize, fontWeight: "700" },
  title: { ...typography.pageTitle, color: colors.text, marginBottom: 20 },
  error: { backgroundColor: "#FEE4E2", borderRadius: 10, color: "#B42318", marginBottom: 14, padding: 12 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E3E9E4", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  member: { paddingBottom: 16, paddingTop: 16 },
  divider: { borderTopColor: "#EDF0ED", borderTopWidth: 1 },
  memberTop: { alignItems: "center", flexDirection: "row" },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { color: "#17211F", fontSize: typography.body.fontSize, fontWeight: "600", marginBottom: 6 },
  badge: { alignSelf: "flex-start", backgroundColor: "#EFF2EF", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 },
  ownerBadge: { backgroundColor: "#FFF2CC" },
  badgeText: { ...typography.caption, color: "#56635C", fontWeight: "700" },
  ownerText: { color: "#8A5A00" },
  rowAction: { flexShrink: 0, marginLeft: 12 },
  removeButton: { borderColor: "#F2C6C3", borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  removeText: { color: "#B42318", fontSize: typography.caption.fontSize, fontWeight: "700" },
  transferButton: { alignItems: "center", borderColor: "#F2C6C3", borderRadius: 11, borderWidth: 1, marginTop: 18, minHeight: 48, justifyContent: "center" },
  transferText: { color: "#B42318", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", flex: 1, justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, maxHeight: "80%", padding: 20, width: "100%" },
  modalTitle: { color: "#17211F", fontSize: typography.subheading.fontSize, fontWeight: "700" },
  modalCopy: { color: "#68736F", fontSize: typography.bodySmall.fontSize, lineHeight: 20, marginTop: 8 },
  modalList: { marginTop: 12 },
  targetRow: { alignItems: "center", borderTopColor: "#EDF0ED", borderTopWidth: 1, flexDirection: "row", minHeight: 58, paddingVertical: 10 },
  radio: { borderColor: "#9AA69F", borderRadius: 9, borderWidth: 1.5, height: 18, marginRight: 12, width: 18 },
  radioSelected: { backgroundColor: "#2F6B5F", borderColor: "#2F6B5F" },
  targetInfo: { flex: 1 },
  targetName: { color: "#17211F", fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
  targetRole: { color: "#7A8580", fontSize: typography.caption.fontSize, marginTop: 3 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  cancelButton: { borderColor: "#D7E0D9", borderRadius: 9, borderWidth: 1, justifyContent: "center", paddingHorizontal: 16, minHeight: 42 },
  cancelText: { color: "#56635C", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  confirmButton: { alignItems: "center", backgroundColor: "#2F6B5F", borderRadius: 9, justifyContent: "center", minHeight: 42, minWidth: 88, paddingHorizontal: 16 },
  confirmText: { color: "#FFFFFF", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
