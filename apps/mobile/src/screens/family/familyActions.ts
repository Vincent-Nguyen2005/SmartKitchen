/**
 * Family roles and the confirm dialogs of the family actions (pure helpers, tested in familyActions.test.ts).
 * Family roles are only the owner (chủ gia đình) and members (thành viên): a leftover ADMIN from older data is shown
 * and treated as a member. The platform admin role (Quản trị, user.role) is unrelated.
 */
export type FamilyRoleValue = "OWNER" | "ADMIN" | "MEMBER";

/** Request for useConfirm (components/ConfirmDialog). */
export type ConfirmRequest = { title: string; message: string; confirmLabel: string; cancelLabel?: string | null; destructive?: boolean };

export const isFamilyOwner = (role: FamilyRoleValue | null | undefined): boolean => role === "OWNER";

/** "Chủ gia đình" / "Thành viên" (ADMIN counts as a member). */
export const familyRoleLabel = (role: FamilyRoleValue): string => (role === "OWNER" ? "Chủ gia đình" : "Thành viên");

const nameOf = (displayName: string | null | undefined, fallback: string): string => displayName?.trim() || fallback;

/** Only the owner can ask someone to leave ("Mời ra"); never the owner, never oneself. */
export const canRemoveMember = (member: { role: FamilyRoleValue; userId: string }, currentUserRole: FamilyRoleValue | null | undefined, currentUserId: string): boolean =>
  isFamilyOwner(currentUserRole) && member.role !== "OWNER" && member.userId !== currentUserId;

/** A member leaving: "Rời gia đình <tên>?" — "Ở lại" / "Rời gia đình". */
export const leaveConfirm = (familyName: string): ConfirmRequest => ({
  title: `Rời gia đình ${familyName.trim()}?`,
  message: "Bạn sẽ không còn xem Kho, thực đơn và giỏ hàng của gia đình này.",
  cancelLabel: "Ở lại",
  confirmLabel: "Rời gia đình",
  destructive: true,
});

/**
 * The owner cannot leave (family-service answers 409 until ownership is transferred). With other members: go to
 * Quản lý thành viên to transfer it; alone in the family: just explain.
 */
export const ownerLeaveNotice = (otherMembers: number): ConfirmRequest => otherMembers > 0
  ? {
    title: "Chuyển quyền trước khi rời",
    message: "Bạn là chủ gia đình. Hãy chuyển quyền chủ gia đình cho một thành viên khác, sau đó bạn có thể rời gia đình.",
    cancelLabel: "Để sau",
    confirmLabel: "Quản lý thành viên",
  }
  : {
    title: "Chưa thể rời gia đình",
    message: "Bạn là chủ gia đình và là thành viên duy nhất. Hãy mời thêm thành viên và chuyển quyền chủ gia đình trước khi rời.",
    cancelLabel: null,
    confirmLabel: "Đã hiểu",
  };

/** Owner removing a member: "Mời <tên> ra khỏi gia đình?" — "Hủy" / "Mời ra". */
export const removeConfirm = (displayName: string | null | undefined): ConfirmRequest => ({
  title: `Mời ${nameOf(displayName, "thành viên này")} ra khỏi gia đình?`,
  message: "Người này sẽ không còn xem Kho, thực đơn và giỏ hàng của gia đình.",
  cancelLabel: "Hủy",
  confirmLabel: "Mời ra",
  destructive: true,
});

/** After picking the new owner: "Chuyển quyền chủ gia đình cho <tên>?" — "Hủy" / "Chuyển quyền". */
export const transferConfirm = (displayName: string | null | undefined): ConfirmRequest => ({
  title: `Chuyển quyền chủ gia đình cho ${nameOf(displayName, "thành viên này")}?`,
  message: "Bạn sẽ trở thành thành viên.",
  cancelLabel: "Hủy",
  confirmLabel: "Chuyển quyền",
  destructive: true,
});
